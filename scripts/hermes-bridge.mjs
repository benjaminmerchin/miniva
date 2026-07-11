/**
 * Hermes -> Miniva bridge.
 *
 * Reads the real sessions from the demo Hermes instance and ingests each one
 * as a run with its full trace: every assistant turn becomes an llm_call step,
 * every tool invocation a tool_call step nested under the turn that made it,
 * with the tool's actual result as the step output. Timestamps are the
 * session's own, so the dashboard shows when things really happened.
 *
 *   node scripts/hermes-bridge.mjs           # one sync pass
 *   node scripts/hermes-bridge.mjs --watch   # keep syncing every 30s
 *
 * Idempotent on session ids — safe to run as often as you like.
 */
const HERMES = process.env.HERMES_BASE ?? "http://144.76.184.186:8787";
const MINIVA = process.env.MINIVA_BASE ?? "https://friendly-lion-451.convex.site";
const KEY = process.env.MINIVA_INGEST_KEY ?? "mnv_ff3546b7b1184297a988966e669d3b6f";

const post = async (path, body) => {
  const res = await fetch(`${MINIVA}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${await res.text()}`);
  return res.json();
};

const text = (content) => {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((c) => (typeof c === "string" ? c : (c?.text ?? "")))
      .join(" ");
  }
  return content == null ? "" : JSON.stringify(content);
};

const clip = (s, n = 600) => {
  const t = text(s).trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
};

async function syncOnce() {
  const { sessions } = await fetch(`${HERMES}/api/sessions`).then((r) => r.json());
  let imported = 0;

  for (const meta of sessions) {
    const sid = meta.session_id;
    const detail = await fetch(
      `${HERMES}/api/session?session_id=${encodeURIComponent(sid)}&messages=1`,
    ).then((r) => r.json());
    const s = detail.session;
    const messages = s?.messages ?? [];
    if (!messages.length) continue;

    const firstUser = messages.find((m) => m.role === "user");
    const input = clip(firstUser?.content ?? s.title, 300) || s.title;
    const agentKey = s.profile || "hermes";
    const runId = `hermes_${sid}`;
    const t0 = Math.round((s.created_at ?? Date.now() / 1000) * 1000);

    await post("/v1/runs", {
      runId,
      taskKind: s.source_tag || "hermes_session",
      input,
      discordUserId: "demo-discord",
      startedAt: t0,
    });

    // Build the trace. The first assistant turn is the root; later turns hang
    // off it; each tool_call nests under the turn that made it, and the tool
    // messages that follow a turn are matched to its calls in order.
    const steps = [];
    let rootId = null;
    let lastAssistantText = "";

    for (let i = 0; i < messages.length; i++) {
      const m = messages[i];
      if (m.role !== "assistant") continue;

      const stepId = `a${i}`;
      const ts = Math.round((m.timestamp ?? s.created_at) * 1000);
      const next = messages[i + 1];
      const tsEnd = next?.timestamp ? Math.round(next.timestamp * 1000) : ts + 1000;
      const prev = messages[i - 1];
      if (text(m.content).trim()) lastAssistantText = clip(m.content, 300);

      steps.push({
        runId,
        stepId,
        parentStepId: rootId ?? undefined,
        agentKey,
        type: rootId ? "llm_call" : "plan",
        name: rootId ? "assistant turn" : "read request + plan",
        input: clip(prev?.content ?? input),
        output: clip(m.content) || clip(m.reasoning_content ?? m.reasoning ?? ""),
        tokensIn: 0,
        tokensOut: 0,
        costUsd: 0,
        startedAt: ts,
        endedAt: tsEnd,
        status: "ok",
      });
      if (!rootId) rootId = stepId;

      // Tool results follow the assistant turn, in call order.
      const toolResults = [];
      for (let j = i + 1; j < messages.length && messages[j].role === "tool"; j++) {
        toolResults.push(messages[j]);
      }

      (m.tool_calls ?? []).forEach((tc, k) => {
        const fn = tc.function ?? {};
        const result = toolResults[k];
        const tts = result?.timestamp
          ? Math.round(result.timestamp * 1000)
          : tsEnd;
        steps.push({
          runId,
          stepId: `t${i}_${k}`,
          parentStepId: stepId,
          agentKey,
          type: "tool_call",
          name: fn.name ?? "tool",
          input: clip(fn.arguments ?? ""),
          output: clip(result?.content ?? "(no result recorded)"),
          tokensIn: 0,
          tokensOut: 0,
          costUsd: 0,
          startedAt: ts,
          endedAt: tts,
          status: "ok",
        });
      });
    }

    if (steps.length) await post("/v1/steps", { steps });

    const lastTs = messages.at(-1)?.timestamp ?? s.updated_at ?? s.created_at;
    await post("/v1/runs/complete", {
      runId,
      status: "succeeded",
      outcome: lastAssistantText || `Session "${s.title}" — ${messages.length} messages.`,
      endedAt: Math.round(lastTs * 1000),
    });

    imported++;
    console.log(`  ✓ ${runId} — "${s.title}" (${steps.length} steps)`);
  }

  console.log(`synced ${imported}/${sessions.length} sessions`);
}

if (process.argv.includes("--watch")) {
  console.log("watching — syncing every 30s (ctrl-c to stop)");
  for (;;) {
    await syncOnce().catch((e) => console.error("sync failed:", e.message));
    await new Promise((r) => setTimeout(r, 30_000));
  }
} else {
  await syncOnce();
}
