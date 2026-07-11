import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Miniva <-> Hermes shared contract.
 *
 * Miniva writes:  servers, agents, agentVersions, evalCases
 * Hermes writes:  runs, steps, alerts   (via the HTTP endpoints in convex/http.ts)
 *
 * A step's parentStepId is what makes the trace a tree rather than a list.
 * Never drop it: the whole observability view is built on it.
 */

const guardrails = v.object({
  maxCostUsd: v.number(),
  maxSteps: v.number(),
  requiresHumanApproval: v.boolean(),
  allowedChannelIds: v.array(v.string()),
  escalateToDiscordUserId: v.optional(v.string()),
});

export default defineSchema({
  // A Discord guild onboarded through the Miniva wizard.
  servers: defineTable({
    guildId: v.string(),
    name: v.string(),
    iconUrl: v.optional(v.string()),
    ownerDiscordId: v.string(),

    // The provisioner sets these once the Hermes instance is up.
    hermesInstanceId: v.optional(v.string()),
    hermesUrl: v.optional(v.string()),
    status: v.union(
      v.literal("provisioning"),
      v.literal("live"),
      v.literal("paused"),
      v.literal("error"),
    ),
    statusMessage: v.optional(v.string()),

    // Bearer token the Hermes instance uses to read config and push traces.
    ingestKey: v.string(),

    plan: v.union(v.literal("free"), v.literal("pro")),
    createdAt: v.number(),
  })
    .index("by_guild", ["guildId"])
    .index("by_ingest_key", ["ingestKey"])
    .index("by_owner", ["ownerDiscordId"]),

  // An agent role, as defined by a non-engineer in the wizard.
  // This IS the L5 management-UI test: job + tools + guardrails, no code.
  agents: defineTable({
    serverId: v.id("servers"),
    key: v.string(), // stable slug, e.g. "support-triage"
    name: v.string(),
    role: v.union(v.literal("manager"), v.literal("specialist")),
    job: v.string(), // the prompt: what this agent is responsible for
    tools: v.array(v.string()), // e.g. ["linkup.search", "discord.reply", "elevenlabs.speak"]
    guardrails,
    model: v.string(),

    // Bumped on every edit. Eval scores are attributed to a version, which is
    // what lets the dashboard show quality climbing across versions.
    version: v.number(),
    enabled: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_server", ["serverId"])
    .index("by_server_key", ["serverId", "key"]),

  // Immutable history of every agent definition. Prompts are version-controlled
  // in the product, not in git.
  agentVersions: defineTable({
    agentId: v.id("agents"),
    serverId: v.id("servers"),
    version: v.number(),
    job: v.string(),
    tools: v.array(v.string()),
    guardrails,
    model: v.string(),
    createdAt: v.number(),
  })
    .index("by_agent", ["agentId"])
    .index("by_agent_version", ["agentId", "version"]),

  // One task the crew executed, end to end.
  runs: defineTable({
    serverId: v.id("servers"),
    runId: v.string(), // Hermes-supplied, stable, idempotent
    taskKind: v.string(), // "support_ticket" | "moderation" | "onboarding" | ...
    input: v.string(), // the message that triggered it

    discordChannelId: v.optional(v.string()),
    discordMessageId: v.optional(v.string()),
    discordUserId: v.optional(v.string()),

    status: v.union(
      v.literal("running"),
      v.literal("succeeded"),
      v.literal("failed"),
      v.literal("escalated"),
    ),
    outcome: v.optional(v.string()), // what actually landed on the real surface
    error: v.optional(v.string()),

    startedAt: v.number(),
    endedAt: v.optional(v.number()),
    durationMs: v.optional(v.number()),
    totalCostUsd: v.number(),
    totalTokensIn: v.number(),
    totalTokensOut: v.number(),

    // Set when this run was triggered by the eval harness rather than a real user.
    evalCaseId: v.optional(v.id("evalCases")),
    // Snapshot of which agent versions ran, so a score can be tied to a version.
    agentVersions: v.optional(v.array(v.object({ key: v.string(), version: v.number() }))),
  })
    .index("by_server", ["serverId"])
    .index("by_run_id", ["runId"])
    .index("by_server_status", ["serverId", "status"])
    .index("by_server_started", ["serverId", "startedAt"]),

  // One agent action inside a run. parentStepId builds the tree.
  steps: defineTable({
    runId: v.string(),
    serverId: v.id("servers"),
    stepId: v.string(), // Hermes-supplied, stable
    parentStepId: v.optional(v.string()), // null => root step (the manager)

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
    name: v.string(), // "linkup.search", "review draft", ...
    input: v.string(),
    output: v.string(),

    tokensIn: v.number(),
    tokensOut: v.number(),
    costUsd: v.number(),

    startedAt: v.number(),
    endedAt: v.optional(v.number()),
    durationMs: v.optional(v.number()),
    status: v.union(v.literal("ok"), v.literal("error")),
    error: v.optional(v.string()),
  })
    .index("by_run", ["runId"])
    .index("by_run_step", ["runId", "stepId"])
    .index("by_server_agent", ["serverId", "agentKey"]),

  // Fired by the ingest layer, not by Hermes: a failure, or a run costing
  // materially more than this server's rolling baseline.
  alerts: defineTable({
    serverId: v.id("servers"),
    runId: v.optional(v.string()),
    kind: v.union(
      v.literal("failure"),
      v.literal("cost_spike"),
      v.literal("guardrail_breach"),
    ),
    message: v.string(),
    observed: v.optional(v.number()),
    baseline: v.optional(v.number()),
    acknowledged: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_server", ["serverId"])
    .index("by_server_ack", ["serverId", "acknowledged"]),

  // The named eval set. source="captured_failure" is the closed loop:
  // a run that failed or escalated becomes a test case automatically.
  evalCases: defineTable({
    serverId: v.id("servers"),
    setName: v.string(),
    input: v.string(),
    expected: v.string(),
    source: v.union(v.literal("manual"), v.literal("captured_failure")),
    sourceRunId: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_server", ["serverId"])
    .index("by_server_set", ["serverId", "setName"]),

  // One execution of the whole eval set against a given set of agent versions.
  evalRuns: defineTable({
    serverId: v.id("servers"),
    setName: v.string(),
    label: v.string(), // "v3 — tightened refund guardrail"
    agentVersions: v.array(v.object({ key: v.string(), version: v.number() })),
    status: v.union(v.literal("running"), v.literal("done")),
    passed: v.number(),
    total: v.number(),
    totalCostUsd: v.number(),
    startedAt: v.number(),
    endedAt: v.optional(v.number()),
  })
    .index("by_server", ["serverId"])
    .index("by_server_started", ["serverId", "startedAt"]),

  evalResults: defineTable({
    evalRunId: v.id("evalRuns"),
    caseId: v.id("evalCases"),
    runId: v.optional(v.string()),
    passed: v.boolean(),
    reason: v.string(),
    costUsd: v.number(),
  }).index("by_eval_run", ["evalRunId"]),

  // Signups — needed for the cross-track bonus, and the Dodo checkout hangs off it.
  signups: defineTable({
    email: v.string(),
    discordId: v.optional(v.string()),
    source: v.optional(v.string()),
    activated: v.boolean(), // true once they connected a real guild
    createdAt: v.number(),
  }).index("by_email", ["email"]),

  // Invoices — tracked for user fiscal tax purposes.
  invoices: defineTable({
    serverId: v.id("servers"), // Which server's bot processed this
    discordUserId: v.string(), // The user who sent the invoice
    amountHT: v.optional(v.number()),
    amountTTC: v.optional(v.number()),
    tva: v.optional(v.number()),
    date: v.optional(v.string()),
    vendor: v.optional(v.string()),
    category: v.optional(v.string()),
    receiptUrl: v.optional(v.string()),
    status: v.union(v.literal("pending"), v.literal("processed")),
    rawText: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_server", ["serverId"])
    .index("by_discord_user", ["discordUserId"])
    .index("by_server_discord_user", ["serverId", "discordUserId"]),

  // Groceries — shopping lists managed by Grogro.
  groceries: defineTable({
    serverId: v.id("servers"), // Which server's bot processed this
    discordUserId: v.string(), // The user who added the item
    item: v.string(),
    quantity: v.optional(v.number()),
    status: v.union(v.literal("pending"), v.literal("bought")),
    createdAt: v.number(),
  })
    .index("by_server", ["serverId"])
    .index("by_discord_user", ["discordUserId"])
    .index("by_server_status", ["serverId", "status"]),
});
