import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

// A run must cost this many times the server's rolling baseline before we page anyone.
const COST_SPIKE_FACTOR = 3;
const BASELINE_WINDOW = 20;

export const serverByKey = internalQuery({
  args: { ingestKey: v.string() },
  handler: async (ctx, { ingestKey }) =>
    await ctx.db
      .query("servers")
      .withIndex("by_ingest_key", (q) => q.eq("ingestKey", ingestKey))
      .unique(),
});

/** What a Hermes instance reads on boot to build its crew. */
export const configForServer = internalQuery({
  args: { serverId: v.id("servers") },
  handler: async (ctx, { serverId }) => {
    const server = await ctx.db.get(serverId);
    if (!server) throw new Error("server not found");

    const agents = await ctx.db
      .query("agents")
      .withIndex("by_server", (q) => q.eq("serverId", serverId))
      .collect();

    return {
      guildId: server.guildId,
      plan: server.plan,
      agents: agents
        .filter((a) => a.enabled)
        .map((a) => ({
          key: a.key,
          name: a.name,
          role: a.role,
          job: a.job,
          tools: a.tools,
          guardrails: a.guardrails,
          model: a.model,
          version: a.version,
        })),
    };
  },
});

export const startRun = internalMutation({
  args: {
    serverId: v.id("servers"),
    runId: v.string(),
    taskKind: v.string(),
    input: v.string(),
    discordChannelId: v.optional(v.string()),
    discordMessageId: v.optional(v.string()),
    discordUserId: v.optional(v.string()),
    agentVersions: v.optional(v.array(v.object({ key: v.string(), version: v.number() }))),
    evalCaseId: v.optional(v.id("evalCases")),
    // Optional so live runs default to now, while imports of past sessions
    // keep their real wall-clock time.
    startedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("runs")
      .withIndex("by_run_id", (q) => q.eq("runId", args.runId))
      .unique();
    if (existing) return existing._id; // idempotent: Hermes may retry

    return await ctx.db.insert("runs", {
      ...args,
      status: "running",
      startedAt: args.startedAt ?? Date.now(),
      totalCostUsd: 0,
      totalTokensIn: 0,
      totalTokensOut: 0,
    });
  },
});

/**
 * Append one step. Hermes may send these as they happen (streaming) or batched.
 * Rolls the cost/token totals up onto the run so the list view never has to
 * aggregate steps at read time.
 */
export const appendStep = internalMutation({
  args: {
    serverId: v.id("servers"),
    runId: v.string(),
    stepId: v.string(),
    parentStepId: v.optional(v.string()),
    agentKey: v.string(),
    type: v.union(
      v.literal("plan"),
      v.literal("delegate"),
      v.literal("llm_call"),
      v.literal("tool_call"),
      v.literal("handoff"),
      v.literal("review"),
      v.literal("escalate"),
      v.literal("output"),
    ),
    name: v.string(),
    input: v.string(),
    output: v.string(),
    tokensIn: v.number(),
    tokensOut: v.number(),
    costUsd: v.number(),
    startedAt: v.number(),
    endedAt: v.optional(v.number()),
    status: v.union(v.literal("ok"), v.literal("error")),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("steps")
      .withIndex("by_run_step", (q) => q.eq("runId", args.runId).eq("stepId", args.stepId))
      .unique();
    if (existing) return existing._id;

    const durationMs = args.endedAt ? args.endedAt - args.startedAt : undefined;
    const stepDocId = await ctx.db.insert("steps", { ...args, durationMs });

    const run = await ctx.db
      .query("runs")
      .withIndex("by_run_id", (q) => q.eq("runId", args.runId))
      .unique();
    if (run) {
      await ctx.db.patch(run._id, {
        totalCostUsd: run.totalCostUsd + args.costUsd,
        totalTokensIn: run.totalTokensIn + args.tokensIn,
        totalTokensOut: run.totalTokensOut + args.tokensOut,
      });
    }
    return stepDocId;
  },
});

export const completeRun = internalMutation({
  args: {
    serverId: v.id("servers"),
    runId: v.string(),
    status: v.union(v.literal("succeeded"), v.literal("failed"), v.literal("escalated")),
    outcome: v.optional(v.string()),
    error: v.optional(v.string()),
    endedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db
      .query("runs")
      .withIndex("by_run_id", (q) => q.eq("runId", args.runId))
      .unique();
    if (!run) throw new Error(`unknown run ${args.runId}`);

    const endedAt = args.endedAt ?? Date.now();
    await ctx.db.patch(run._id, {
      status: args.status,
      outcome: args.outcome,
      error: args.error,
      endedAt,
      durationMs: endedAt - run.startedAt,
    });

    await raiseAlerts(ctx, { ...run, status: args.status, error: args.error });
    return run._id;
  },
});

/**
 * Two things fire an alert, and both are things a senior engineer would want
 * paged on: the crew failed, or a run cost several times what this server's
 * runs normally cost.
 *
 * A failed or escalated run also becomes an eval case. That is the closed loop:
 * production failures grow the test set without anyone remembering to add them.
 */
async function raiseAlerts(
  ctx: { db: any },
  run: Doc<"runs"> & { status: string; error?: string },
) {
  const now = Date.now();

  if (run.status === "failed" || run.status === "escalated") {
    await ctx.db.insert("alerts", {
      serverId: run.serverId,
      runId: run.runId,
      kind: "failure",
      message:
        run.status === "failed"
          ? `Run failed: ${run.error ?? "no error message"}`
          : `Run escalated to a human: ${run.input.slice(0, 120)}`,
      acknowledged: false,
      createdAt: now,
    });

    // Don't capture eval runs as eval cases — that would feed the set its own tail.
    if (!run.evalCaseId) {
      await ctx.db.insert("evalCases", {
        serverId: run.serverId,
        setName: "captured-failures",
        input: run.input,
        expected: "",
        source: "captured_failure",
        sourceRunId: run.runId,
        createdAt: now,
      });
    }
  }

  const recent: Doc<"runs">[] = await ctx.db
    .query("runs")
    .withIndex("by_server_status", (q: any) =>
      q.eq("serverId", run.serverId).eq("status", "succeeded"),
    )
    .order("desc")
    .take(BASELINE_WINDOW);

  const priors = recent.filter((r) => r.runId !== run.runId && r.totalCostUsd > 0);
  if (priors.length < 3) return; // not enough history to call anything a spike

  const baseline = priors.reduce((sum, r) => sum + r.totalCostUsd, 0) / priors.length;
  if (run.totalCostUsd > baseline * COST_SPIKE_FACTOR) {
    await ctx.db.insert("alerts", {
      serverId: run.serverId,
      runId: run.runId,
      kind: "cost_spike",
      message: `Run cost $${run.totalCostUsd.toFixed(3)}, ${(run.totalCostUsd / baseline).toFixed(1)}x the $${baseline.toFixed(3)} baseline`,
      observed: run.totalCostUsd,
      baseline,
      acknowledged: false,
      createdAt: now,
    });
  }
}

/** The provisioner calls this once the Hermes box is actually up. */
export const markProvisioned = internalMutation({
  args: {
    serverId: v.id("servers"),
    hermesInstanceId: v.string(),
    hermesUrl: v.optional(v.string()),
    status: v.union(v.literal("live"), v.literal("error")),
    statusMessage: v.optional(v.string()),
  },
  handler: async (ctx, { serverId, ...rest }) => {
    await ctx.db.patch(serverId, rest);
  },
});
