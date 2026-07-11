/**
 * Proves the Miniva <-> Hermes pipe end to end.
 *
 *   node scripts/hermes-smoke.mjs
 *
 * Posts one run with a three-level trace tree, then completes it. Open the run
 * in the dashboard: if the tree renders with the specialist nested under the
 * manager and the tool nested under the specialist, the contract is satisfied
 * and you can wire the real Hermes the same way.
 *
 * The shape below is the whole contract. Copy it.
 */
const BASE = process.env.MINIVA_BASE ?? "https://friendly-lion-451.convex.site";
const KEY = process.env.MINIVA_INGEST_KEY ?? "mnv_demo_key_do_not_ship";

const post = async (path, body) => {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${JSON.stringify(json)}`);
  return json;
};

const runId = `smoke_${Date.now()}`;
const t = Date.now();

console.log("→ GET /v1/config");
const config = await fetch(`${BASE}/v1/config`, {
  headers: { Authorization: `Bearer ${KEY}` },
}).then((r) => r.json());
console.log(`  crew: ${config.agents.map((a) => `${a.key}@v${a.version}`).join(", ")}`);

console.log(`→ POST /v1/runs  (${runId})`);
await post("/v1/runs", {
  runId,
  taskKind: "support_ticket",
  input: "smoke test — is the pipe open?",
  discordChannelId: "support",
  discordUserId: "smoke",
  agentVersions: config.agents.map((a) => ({ key: a.key, version: a.version })),
});

console.log("→ POST /v1/steps  (3 steps, nested)");
await post("/v1/steps", {
  steps: [
    {
      runId,
      stepId: "s1",
      // no parentStepId => this is the root of the tree
      agentKey: "ops-manager",
      type: "plan",
      name: "classify + plan",
      input: "smoke test — is the pipe open?",
      output: "Delegate to docs-answers.",
      tokensIn: 400,
      tokensOut: 60,
      costUsd: 0.0012,
      startedAt: t,
      endedAt: t + 800,
      status: "ok",
    },
    {
      runId,
      stepId: "s2",
      parentStepId: "s1", // <- nests under the manager
      agentKey: "docs-answers",
      type: "tool_call",
      name: "linkup.search",
      input: "is the pipe open",
      output: "yes",
      tokensIn: 200,
      tokensOut: 90,
      costUsd: 0.0008,
      startedAt: t + 800,
      endedAt: t + 2100,
      status: "ok",
    },
    {
      runId,
      stepId: "s3",
      parentStepId: "s1",
      agentKey: "ops-manager",
      type: "output",
      name: "discord.reply",
      input: "post to #support",
      output: "posted",
      tokensIn: 60,
      tokensOut: 20,
      costUsd: 0.0002,
      startedAt: t + 2100,
      endedAt: t + 2400,
      status: "ok",
    },
  ],
});

console.log("→ POST /v1/runs/complete");
await post("/v1/runs/complete", {
  runId,
  status: "succeeded",
  outcome: "Posted a reply in #support. The pipe is open.",
});

console.log(`\n✓ open https://miniva.co/app/runs/${runId}`);
