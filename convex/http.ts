import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { authComponent, createAuth } from "./auth";

/**
 * The wire between a Hermes instance and Miniva.
 *
 * Every request carries `Authorization: Bearer <ingestKey>`; the key identifies
 * the server, so Hermes never has to know Convex ids.
 *
 * Base URL is the Convex HTTP Actions URL (the .convex.site one, not .convex.cloud).
 */
const http = httpRouter();

// Better Auth's routes (/api/auth/*) live on the same router as the ingest API.
authComponent.registerRoutes(http, createAuth, { cors: true });

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

async function authed(ctx: any, req: Request) {
  const key = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!key) return null;
  return await ctx.runQuery(internal.ingest.serverByKey, { ingestKey: key });
}

/** GET /v1/config — Hermes reads its crew definition on boot and on reload. */
http.route({
  path: "/v1/config",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    const server = await authed(ctx, req);
    if (!server) return json({ error: "bad ingest key" }, 401);
    const config = await ctx.runQuery(internal.ingest.configForServer, {
      serverId: server._id,
    });
    return json(config);
  }),
});

/** POST /v1/runs — a task starts. */
http.route({
  path: "/v1/runs",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const server = await authed(ctx, req);
    if (!server) return json({ error: "bad ingest key" }, 401);

    const b = await req.json();
    if (!b.runId || !b.taskKind || typeof b.input !== "string") {
      return json({ error: "runId, taskKind and input are required" }, 400);
    }

    await ctx.runMutation(internal.ingest.startRun, {
      serverId: server._id,
      runId: b.runId,
      taskKind: b.taskKind,
      input: b.input,
      discordChannelId: b.discordChannelId,
      discordMessageId: b.discordMessageId,
      discordUserId: b.discordUserId,
      agentVersions: b.agentVersions,
      evalCaseId: b.evalCaseId,
      startedAt: b.startedAt,
    });
    return json({ ok: true, runId: b.runId });
  }),
});

/**
 * POST /v1/steps — one step, or a batch of them.
 * Accepts either a single step object or {steps: [...]}. Idempotent on stepId,
 * so Hermes can retry a failed flush without doubling the trace.
 */
http.route({
  path: "/v1/steps",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const server = await authed(ctx, req);
    if (!server) return json({ error: "bad ingest key" }, 401);

    const b = await req.json();
    const steps = Array.isArray(b.steps) ? b.steps : [b];

    for (const s of steps) {
      if (!s.runId || !s.stepId || !s.agentKey || !s.type) {
        return json({ error: "runId, stepId, agentKey and type are required" }, 400);
      }
      await ctx.runMutation(internal.ingest.appendStep, {
        serverId: server._id,
        runId: s.runId,
        stepId: s.stepId,
        parentStepId: s.parentStepId ?? undefined,
        agentKey: s.agentKey,
        type: s.type,
        name: s.name ?? s.type,
        input: typeof s.input === "string" ? s.input : JSON.stringify(s.input ?? ""),
        output: typeof s.output === "string" ? s.output : JSON.stringify(s.output ?? ""),
        tokensIn: s.tokensIn ?? 0,
        tokensOut: s.tokensOut ?? 0,
        costUsd: s.costUsd ?? 0,
        startedAt: s.startedAt ?? Date.now(),
        endedAt: s.endedAt,
        status: s.status ?? "ok",
        error: s.error,
      });
    }
    return json({ ok: true, ingested: steps.length });
  }),
});

/** POST /v1/runs/complete — the task is done, one way or another. */
http.route({
  path: "/v1/runs/complete",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const server = await authed(ctx, req);
    if (!server) return json({ error: "bad ingest key" }, 401);

    const b = await req.json();
    if (!b.runId || !b.status) return json({ error: "runId and status are required" }, 400);

    await ctx.runMutation(internal.ingest.completeRun, {
      serverId: server._id,
      runId: b.runId,
      status: b.status,
      outcome: b.outcome,
      error: b.error,
      endedAt: b.endedAt,
    });
    return json({ ok: true });
  }),
});

/** POST /v1/provisioned — the provisioner reports the Hermes box is up. */
http.route({
  path: "/v1/provisioned",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const server = await authed(ctx, req);
    if (!server) return json({ error: "bad ingest key" }, 401);

    const b = await req.json();
    await ctx.runMutation(internal.ingest.markProvisioned, {
      serverId: server._id,
      hermesInstanceId: b.hermesInstanceId ?? "unknown",
      hermesUrl: b.hermesUrl,
      status: b.status ?? "live",
      statusMessage: b.statusMessage,
    });
    return json({ ok: true });
  }),
});

for (const path of ["/v1/config", "/v1/runs", "/v1/steps", "/v1/runs/complete", "/v1/provisioned"]) {
  http.route({
    path,
    method: "OPTIONS",
    handler: httpAction(async () => new Response(null, { status: 204, headers: cors })),
  });
}

export default http;
