import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

/**
 * The eval surface.
 *
 * L3 is a named set you run by hand to compare versions. What lifts this to L5
 * is the closed loop: every failed or escalated production run is captured as a
 * case automatically (see raiseAlerts in ingest.ts), prompts are versioned in
 * `agentVersions`, and the score is plotted per version so you can see quality
 * climbing — or not.
 */

export const sets = query({
  args: { serverId: v.id("servers") },
  handler: async (ctx, { serverId }) => {
    const cases = await ctx.db
      .query("evalCases")
      .withIndex("by_server", (q) => q.eq("serverId", serverId))
      .collect();

    const bySet = new Map<string, { total: number; captured: number; unlabelled: number }>();
    for (const c of cases) {
      const cur = bySet.get(c.setName) ?? { total: 0, captured: 0, unlabelled: 0 };
      cur.total += 1;
      if (c.source === "captured_failure") cur.captured += 1;
      if (!c.expected.trim()) cur.unlabelled += 1;
      bySet.set(c.setName, cur);
    }

    return [...bySet.entries()].map(([setName, v]) => ({ setName, ...v }));
  },
});

export const cases = query({
  args: { serverId: v.id("servers"), setName: v.optional(v.string()) },
  handler: async (ctx, { serverId, setName }) => {
    const all = await ctx.db
      .query("evalCases")
      .withIndex("by_server", (q) => q.eq("serverId", serverId))
      .order("desc")
      .collect();
    return setName ? all.filter((c) => c.setName === setName) : all;
  },
});

export const addCase = mutation({
  args: {
    serverId: v.id("servers"),
    setName: v.string(),
    input: v.string(),
    expected: v.string(),
  },
  handler: async (ctx, args) =>
    await ctx.db.insert("evalCases", {
      ...args,
      source: "manual",
      createdAt: Date.now(),
    }),
});

/** A captured failure arrives with no expected outcome. A human writes it once. */
export const labelCase = mutation({
  args: { caseId: v.id("evalCases"), expected: v.string() },
  handler: async (ctx, { caseId, expected }) => {
    await ctx.db.patch(caseId, { expected });
  },
});

export const removeCase = mutation({
  args: { caseId: v.id("evalCases") },
  handler: async (ctx, { caseId }) => {
    await ctx.db.delete(caseId);
  },
});

/** History of every time the set was run, newest first — this is the trend line. */
export const runs = query({
  args: { serverId: v.id("servers") },
  handler: async (ctx, { serverId }) =>
    await ctx.db
      .query("evalRuns")
      .withIndex("by_server_started", (q) => q.eq("serverId", serverId))
      .order("desc")
      .take(50),
});

export const runDetail = query({
  args: { evalRunId: v.id("evalRuns") },
  handler: async (ctx, { evalRunId }) => {
    const evalRun = await ctx.db.get(evalRunId);
    if (!evalRun) return null;

    const results = await ctx.db
      .query("evalResults")
      .withIndex("by_eval_run", (q) => q.eq("evalRunId", evalRunId))
      .collect();

    const withCases = await Promise.all(
      results.map(async (r) => ({ ...r, case: await ctx.db.get(r.caseId) })),
    );

    return { evalRun, results: withCases };
  },
});

/**
 * Kick off a run of the set against whatever versions the agents are on right now.
 * The execution itself happens on the Hermes side; it reports back through
 * `recordResult` / `finish`.
 */
export const start = mutation({
  args: { serverId: v.id("servers"), setName: v.string(), label: v.string() },
  handler: async (ctx, { serverId, setName, label }) => {
    const agents = await ctx.db
      .query("agents")
      .withIndex("by_server", (q) => q.eq("serverId", serverId))
      .collect();

    const total = (
      await ctx.db
        .query("evalCases")
        .withIndex("by_server_set", (q) => q.eq("serverId", serverId).eq("setName", setName))
        .collect()
    ).filter((c) => c.expected.trim()).length;

    return await ctx.db.insert("evalRuns", {
      serverId,
      setName,
      label,
      agentVersions: agents.map((a) => ({ key: a.key, version: a.version })),
      status: "running",
      passed: 0,
      total,
      totalCostUsd: 0,
      startedAt: Date.now(),
    });
  },
});

export const recordResult = mutation({
  args: {
    evalRunId: v.id("evalRuns"),
    caseId: v.id("evalCases"),
    runId: v.optional(v.string()),
    passed: v.boolean(),
    reason: v.string(),
    costUsd: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("evalResults", args);

    const evalRun = await ctx.db.get(args.evalRunId);
    if (!evalRun) return;
    await ctx.db.patch(args.evalRunId, {
      passed: evalRun.passed + (args.passed ? 1 : 0),
      totalCostUsd: evalRun.totalCostUsd + args.costUsd,
    });
  },
});

export const finish = mutation({
  args: { evalRunId: v.id("evalRuns") },
  handler: async (ctx, { evalRunId }) => {
    await ctx.db.patch(evalRunId, { status: "done", endedAt: Date.now() });
  },
});
