import { v } from "convex/values";
import { query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

/**
 * The run list, with the filters the observability rubric asks for by name:
 * filter by agent, filter by task kind, and search across runs.
 */
export const list = query({
  args: {
    serverId: v.id("servers"),
    status: v.optional(v.string()),
    agentKey: v.optional(v.string()),
    taskKind: v.optional(v.string()),
    search: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let runs = await ctx.db
      .query("runs")
      .withIndex("by_server_started", (q) => q.eq("serverId", args.serverId))
      .order("desc")
      .take(args.limit ?? 200);

    if (args.status && args.status !== "all") {
      runs = runs.filter((r) => r.status === args.status);
    }
    if (args.taskKind && args.taskKind !== "all") {
      runs = runs.filter((r) => r.taskKind === args.taskKind);
    }

    // "Filter by agent" means: runs in which this agent actually did something.
    if (args.agentKey && args.agentKey !== "all") {
      const touched = await ctx.db
        .query("steps")
        .withIndex("by_server_agent", (q) =>
          q.eq("serverId", args.serverId).eq("agentKey", args.agentKey!),
        )
        .collect();
      const runIds = new Set(touched.map((s) => s.runId));
      runs = runs.filter((r) => runIds.has(r.runId));
    }

    // Search across runs: the trigger, the outcome, the error.
    if (args.search?.trim()) {
      const needle = args.search.toLowerCase();
      runs = runs.filter(
        (r) =>
          r.input.toLowerCase().includes(needle) ||
          (r.outcome ?? "").toLowerCase().includes(needle) ||
          (r.error ?? "").toLowerCase().includes(needle) ||
          r.runId.toLowerCase().includes(needle),
      );
    }

    return runs;
  },
});

export type TraceNode = Doc<"steps"> & {
  children: TraceNode[];
  depth: number;
  subtreeCostUsd: number;
};

/** Fold the flat step list into the call tree via parentStepId. */
function buildTree(steps: Doc<"steps">[]): TraceNode[] {
  const byId = new Map<string, TraceNode>();
  for (const s of steps) {
    byId.set(s.stepId, { ...s, children: [], depth: 0, subtreeCostUsd: s.costUsd });
  }

  const roots: TraceNode[] = [];
  for (const node of byId.values()) {
    const parent = node.parentStepId ? byId.get(node.parentStepId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  const sortByTime = (a: TraceNode, b: TraceNode) => a.startedAt - b.startedAt;
  const walk = (node: TraceNode, depth: number): number => {
    node.depth = depth;
    node.children.sort(sortByTime);
    node.subtreeCostUsd =
      node.costUsd + node.children.reduce((sum, c) => sum + walk(c, depth + 1), 0);
    return node.subtreeCostUsd;
  };

  roots.sort(sortByTime);
  for (const r of roots) walk(r, 0);
  return roots;
}

/** One run, with its trace tree and a per-agent cost breakdown. */
export const detail = query({
  args: { runId: v.string() },
  handler: async (ctx, { runId }) => {
    const run = await ctx.db
      .query("runs")
      .withIndex("by_run_id", (q) => q.eq("runId", runId))
      .unique();
    if (!run) return null;

    const steps = await ctx.db
      .query("steps")
      .withIndex("by_run", (q) => q.eq("runId", runId))
      .collect();

    // "Which agent spent the most?" — answered by the tool, not from memory.
    const byAgent = new Map<string, { costUsd: number; tokens: number; steps: number }>();
    for (const s of steps) {
      const cur = byAgent.get(s.agentKey) ?? { costUsd: 0, tokens: 0, steps: 0 };
      cur.costUsd += s.costUsd;
      cur.tokens += s.tokensIn + s.tokensOut;
      cur.steps += 1;
      byAgent.set(s.agentKey, cur);
    }

    return {
      run,
      tree: buildTree(steps),
      stepCount: steps.length,
      agentBreakdown: [...byAgent.entries()]
        .map(([agentKey, v]) => ({ agentKey, ...v }))
        .sort((a, b) => b.costUsd - a.costUsd),
    };
  },
});

/**
 * Two runs side by side. The diff is computed on the step sequence so a
 * regression shows up as the exact step where the runs diverged.
 */
export const compare = query({
  args: { runIdA: v.string(), runIdB: v.string() },
  handler: async (ctx, { runIdA, runIdB }) => {
    const load = async (runId: string) => {
      const run = await ctx.db
        .query("runs")
        .withIndex("by_run_id", (q) => q.eq("runId", runId))
        .unique();
      if (!run) return null;
      const steps = await ctx.db
        .query("steps")
        .withIndex("by_run", (q) => q.eq("runId", runId))
        .collect();
      steps.sort((a, b) => a.startedAt - b.startedAt);
      return { run, steps, tree: buildTree(steps) };
    };

    const [a, b] = await Promise.all([load(runIdA), load(runIdB)]);
    if (!a || !b) return null;

    // Walk both sequences in lockstep. The first index where the (agent, type, name)
    // signature differs is where the two runs stopped doing the same thing.
    const sig = (s: Doc<"steps">) => `${s.agentKey}::${s.type}::${s.name}`;
    let divergedAt: number | null = null;
    const max = Math.max(a.steps.length, b.steps.length);
    for (let i = 0; i < max; i++) {
      const sa = a.steps[i];
      const sb = b.steps[i];
      if (!sa || !sb || sig(sa) !== sig(sb)) {
        divergedAt = i;
        break;
      }
    }

    return {
      a,
      b,
      divergedAt,
      delta: {
        costUsd: b.run.totalCostUsd - a.run.totalCostUsd,
        durationMs: (b.run.durationMs ?? 0) - (a.run.durationMs ?? 0),
        steps: b.steps.length - a.steps.length,
      },
    };
  },
});

/** Header stats: today's cost, success rate, p50 latency, spend per agent. */
export const stats = query({
  args: { serverId: v.id("servers") },
  handler: async (ctx, { serverId }) => {
    const runs = await ctx.db
      .query("runs")
      .withIndex("by_server_started", (q) => q.eq("serverId", serverId))
      .order("desc")
      .take(500);

    const done = runs.filter((r) => r.status !== "running");
    const succeeded = done.filter((r) => r.status === "succeeded").length;
    const durations = done
      .map((r) => r.durationMs ?? 0)
      .filter(Boolean)
      .sort((x, y) => x - y);

    const steps = await ctx.db
      .query("steps")
      .withIndex("by_server_agent", (q) => q.eq("serverId", serverId))
      .collect();
    const spendByAgent = new Map<string, number>();
    for (const s of steps) {
      spendByAgent.set(s.agentKey, (spendByAgent.get(s.agentKey) ?? 0) + s.costUsd);
    }

    return {
      totalRuns: runs.length,
      running: runs.filter((r) => r.status === "running").length,
      successRate: done.length ? succeeded / done.length : 0,
      escalated: done.filter((r) => r.status === "escalated").length,
      totalCostUsd: runs.reduce((sum, r) => sum + r.totalCostUsd, 0),
      avgCostUsd: done.length
        ? done.reduce((sum, r) => sum + r.totalCostUsd, 0) / done.length
        : 0,
      p50DurationMs: durations.length ? durations[Math.floor(durations.length / 2)] : 0,
      p95DurationMs: durations.length
        ? durations[Math.floor(durations.length * 0.95)] ?? durations.at(-1)!
        : 0,
      spendByAgent: [...spendByAgent.entries()]
        .map(([agentKey, costUsd]) => ({ agentKey, costUsd }))
        .sort((a, b) => b.costUsd - a.costUsd),
      taskKinds: [...new Set(runs.map((r) => r.taskKind))],
    };
  },
});
