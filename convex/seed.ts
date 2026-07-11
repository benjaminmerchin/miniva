import { mutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

/**
 * Demo dataset: a real-shaped community-ops crew for a dev-tool Discord.
 *
 * Run with:  npx convex run seed:demo
 *
 * Everything here has the exact shape Hermes will POST, so the moment the real
 * instance connects, the UI doesn't change — the data just becomes real.
 */

const MIN = 60_000;
const HOUR = 60 * MIN;

type StepSeed = {
  stepId: string;
  parentStepId?: string;
  agentKey: string;
  type:
    | "plan"
    | "delegate"
    | "llm_call"
    | "tool_call"
    | "handoff"
    | "review"
    | "escalate"
    | "output";
  name: string;
  input: string;
  output: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  offsetMs: number;
  durationMs: number;
  status?: "ok" | "error";
  error?: string;
};

export const demo = mutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    // Wipe anything from a previous seed so re-running is safe mid-demo.
    for (const table of [
      "evalResults",
      "evalRuns",
      "evalCases",
      "alerts",
      "steps",
      "runs",
      "agentVersions",
      "agents",
      "servers",
    ] as const) {
      for (const row of await ctx.db.query(table).collect()) await ctx.db.delete(row._id);
    }

    const serverId = await ctx.db.insert("servers", {
      guildId: "1187442997219930112",
      name: "Rivet — Community",
      iconUrl: undefined,
      ownerDiscordId: "benjamin",
      hermesInstanceId: "hermes-fra-01",
      hermesUrl: "https://hermes-fra-01.miniva.co",
      status: "live",
      // Generated, never hardcoded: this repo is public, and a literal here
      // would be a live credential anyone could post fake runs with.
      ingestKey: `mnv_${crypto.randomUUID().replace(/-/g, "")}`,
      plan: "pro",
      createdAt: now - 6 * HOUR,
    });

    const agentDefs = [
      {
        key: "ops-manager",
        name: "Ops Manager",
        role: "manager" as const,
        job: "Read every incoming message in the community. Decide what it actually needs, delegate to the right specialists, review their draft before it ships, and escalate to a human only when policy says you must.",
        tools: ["discord.reply", "discord.thread", "miniva.escalate"],
        model: "gpt-5.5",
        version: 4,
        guardrails: {
          maxCostUsd: 0.5,
          maxSteps: 25,
          requiresHumanApproval: false,
          allowedChannelIds: ["support", "general", "bugs"],
          escalateToDiscordUserId: "benjamin",
        },
      },
      {
        key: "docs-answers",
        name: "Docs Answers",
        role: "specialist" as const,
        job: "Answer product questions using the live docs and the public web. Quote the source. If the docs do not actually answer it, say so instead of inventing an answer.",
        tools: ["linkup.search", "discord.reply"],
        model: "gpt-5.5",
        version: 3,
        guardrails: {
          maxCostUsd: 0.2,
          maxSteps: 10,
          requiresHumanApproval: false,
          allowedChannelIds: ["support", "general"],
        },
      },
      {
        key: "billing-refunds",
        name: "Billing & Refunds",
        role: "specialist" as const,
        job: "Handle billing questions and refund requests. Check the subscription record before answering. Refunds under €20 within 14 days are automatic; anything else goes to a human.",
        tools: ["discord.reply", "miniva.escalate"],
        model: "gpt-5.5",
        version: 2,
        guardrails: {
          maxCostUsd: 0.3,
          maxSteps: 12,
          requiresHumanApproval: false,
          allowedChannelIds: ["support"],
          escalateToDiscordUserId: "benjamin",
        },
      },
      {
        key: "moderation",
        name: "Moderation",
        role: "specialist" as const,
        job: "Watch for spam, scam links and hostility. Delete and time out obvious spam. For anything a reasonable person could disagree about, flag it to a human instead of acting.",
        tools: ["discord.moderate", "discord.react"],
        model: "gpt-5.5",
        version: 2,
        guardrails: {
          maxCostUsd: 0.05,
          maxSteps: 6,
          requiresHumanApproval: false,
          allowedChannelIds: ["general", "support", "bugs"],
        },
      },
      {
        key: "voice-concierge",
        name: "Voice Concierge",
        role: "specialist" as const,
        job: "Join the onboarding voice channel when a new member drops in, greet them out loud, walk them through setup, and answer follow-ups by voice.",
        tools: ["discord.voice", "elevenlabs.speak", "linkup.search"],
        model: "gpt-5.5",
        version: 1,
        guardrails: {
          maxCostUsd: 0.4,
          maxSteps: 20,
          requiresHumanApproval: false,
          allowedChannelIds: ["onboarding-vc"],
        },
      },
    ];

    const agentIds: Record<string, Id<"agents">> = {};
    for (const a of agentDefs) {
      const agentId = await ctx.db.insert("agents", {
        serverId,
        key: a.key,
        name: a.name,
        role: a.role,
        job: a.job,
        tools: a.tools,
        guardrails: a.guardrails,
        model: a.model,
        version: a.version,
        enabled: true,
        createdAt: now - 6 * HOUR,
        updatedAt: now - 40 * MIN,
      });
      agentIds[a.key] = agentId;

      for (let v = 1; v <= a.version; v++) {
        await ctx.db.insert("agentVersions", {
          agentId,
          serverId,
          version: v,
          job: v === a.version ? a.job : `${a.job}\n\n[v${v} — earlier wording]`,
          tools: a.tools,
          guardrails: a.guardrails,
          model: a.model,
          createdAt: now - 6 * HOUR + v * 45 * MIN,
        });
      }
    }

    // ---- Runs -------------------------------------------------------------
    // Each is a real-shaped trace: the manager plans, delegates, reviews, ships.

    const runSeeds: Array<{
      runId: string;
      taskKind: string;
      input: string;
      status: "succeeded" | "failed" | "escalated";
      outcome?: string;
      error?: string;
      startedAgo: number;
      discordUserId: string;
      steps: StepSeed[];
    }> = [
      {
        runId: "run_docs_4471",
        taskKind: "docs_question",
        input: "does the SDK support streaming responses on the edge runtime?",
        status: "succeeded",
        outcome:
          "Replied in #support with the streaming section of the docs + the edge caveat, linked to the changelog entry. Thread closed by the asker with a ✅.",
        startedAgo: 22 * MIN,
        discordUserId: "u_8812",
        steps: [
          {
            stepId: "s1",
            agentKey: "ops-manager",
            type: "plan",
            name: "classify + plan",
            input: "does the SDK support streaming responses on the edge runtime?",
            output:
              "Product question, answerable from docs. Plan: delegate → docs-answers. No billing, no moderation. Review the draft before posting.",
            tokensIn: 890,
            tokensOut: 120,
            costUsd: 0.0031,
            offsetMs: 0,
            durationMs: 1400,
          },
          {
            stepId: "s2",
            parentStepId: "s1",
            agentKey: "ops-manager",
            type: "delegate",
            name: "→ docs-answers",
            input: "Answer the streaming/edge question. Quote the source.",
            output: "assigned",
            tokensIn: 140,
            tokensOut: 40,
            costUsd: 0.0006,
            offsetMs: 1400,
            durationMs: 200,
          },
          {
            stepId: "s3",
            parentStepId: "s2",
            agentKey: "docs-answers",
            type: "tool_call",
            name: "linkup.search",
            input: "SDK streaming responses edge runtime support",
            output:
              "3 results — docs/streaming (canonical), changelog #142 'edge streaming GA', a GitHub issue about the old limitation (closed).",
            tokensIn: 320,
            tokensOut: 480,
            costUsd: 0.0024,
            offsetMs: 1600,
            durationMs: 2100,
          },
          {
            stepId: "s4",
            parentStepId: "s2",
            agentKey: "docs-answers",
            type: "llm_call",
            name: "draft answer",
            input: "compose answer from 3 sources",
            output:
              "Yes — streaming on edge went GA in v2.4 (changelog #142). Before that it fell back to buffering. Here's the snippet: …",
            tokensIn: 1650,
            tokensOut: 310,
            costUsd: 0.0058,
            offsetMs: 3700,
            durationMs: 2600,
          },
          {
            stepId: "s5",
            parentStepId: "s1",
            agentKey: "ops-manager",
            type: "review",
            name: "review draft",
            input: "docs-answers draft",
            output: "Source quoted, version named, no invention. Approved.",
            tokensIn: 620,
            tokensOut: 70,
            costUsd: 0.0019,
            offsetMs: 6300,
            durationMs: 900,
          },
          {
            stepId: "s6",
            parentStepId: "s1",
            agentKey: "ops-manager",
            type: "output",
            name: "discord.reply",
            input: "post to #support thread",
            output: "posted — message id 118844",
            tokensIn: 90,
            tokensOut: 20,
            costUsd: 0.0003,
            offsetMs: 7200,
            durationMs: 400,
          },
        ],
      },
      {
        runId: "run_refund_4472",
        taskKind: "billing",
        input: "j'ai été débité deux fois ce mois-ci, je veux un remboursement",
        status: "succeeded",
        outcome:
          "Duplicate charge confirmed (€12.40, 2 days ago). Auto-refund issued under the <€20/14-day policy, receipt DM'd, ticket #431 closed.",
        startedAgo: 48 * MIN,
        discordUserId: "u_2201",
        steps: [
          {
            stepId: "s1",
            agentKey: "ops-manager",
            type: "plan",
            name: "classify + plan",
            input: "double charge, refund request (fr)",
            output:
              "Billing. Plan: delegate → billing-refunds. Policy check required before any money moves.",
            tokensIn: 910,
            tokensOut: 130,
            costUsd: 0.0033,
            offsetMs: 0,
            durationMs: 1200,
          },
          {
            stepId: "s2",
            parentStepId: "s1",
            agentKey: "ops-manager",
            type: "delegate",
            name: "→ billing-refunds",
            input: "Verify the duplicate charge against the subscription record first.",
            output: "assigned",
            tokensIn: 120,
            tokensOut: 35,
            costUsd: 0.0005,
            offsetMs: 1200,
            durationMs: 180,
          },
          {
            stepId: "s3",
            parentStepId: "s2",
            agentKey: "billing-refunds",
            type: "tool_call",
            name: "billing.lookup",
            input: "u_2201 charges last 30d",
            output: "2 charges €12.40 — 2026-07-09 14:02 and 2026-07-09 14:03. Duplicate confirmed.",
            tokensIn: 280,
            tokensOut: 190,
            costUsd: 0.0014,
            offsetMs: 1380,
            durationMs: 1600,
          },
          {
            stepId: "s4",
            parentStepId: "s2",
            agentKey: "billing-refunds",
            type: "llm_call",
            name: "apply refund policy",
            input: "€12.40, 2 days old, duplicate",
            output: "Under €20 and inside 14 days → automatic. No human needed.",
            tokensIn: 740,
            tokensOut: 90,
            costUsd: 0.0022,
            offsetMs: 2980,
            durationMs: 1100,
          },
          {
            stepId: "s5",
            parentStepId: "s2",
            agentKey: "billing-refunds",
            type: "tool_call",
            name: "billing.refund",
            input: "refund €12.40 → u_2201",
            output: "refunded, receipt re_88x21",
            tokensIn: 110,
            tokensOut: 40,
            costUsd: 0.0005,
            offsetMs: 4080,
            durationMs: 2400,
          },
          {
            stepId: "s6",
            parentStepId: "s1",
            agentKey: "ops-manager",
            type: "output",
            name: "discord.reply",
            input: "confirm in thread + DM receipt",
            output: "posted + DM sent, ticket #431 closed",
            tokensIn: 130,
            tokensOut: 60,
            costUsd: 0.0006,
            offsetMs: 6480,
            durationMs: 700,
          },
        ],
      },
      {
        runId: "run_mod_4473",
        taskKind: "moderation",
        input: "🎁 FREE NITRO steamcommunity-gift.ru/claim 🎁",
        status: "succeeded",
        outcome: "Scam link deleted, member timed out 24h, #mod-log updated. 0.9s end to end.",
        startedAgo: 55 * MIN,
        discordUserId: "u_9911",
        steps: [
          {
            stepId: "s1",
            agentKey: "ops-manager",
            type: "plan",
            name: "classify",
            input: "message with known scam domain pattern",
            output: "Obvious scam. Straight to moderation, no review needed.",
            tokensIn: 260,
            tokensOut: 40,
            costUsd: 0.0008,
            offsetMs: 0,
            durationMs: 300,
          },
          {
            stepId: "s2",
            parentStepId: "s1",
            agentKey: "moderation",
            type: "tool_call",
            name: "discord.moderate",
            input: "delete + timeout 24h",
            output: "message deleted, u_9911 timed out until 2026-07-12",
            tokensIn: 180,
            tokensOut: 50,
            costUsd: 0.0006,
            offsetMs: 300,
            durationMs: 600,
          },
        ],
      },
      {
        runId: "run_refund_4474",
        taskKind: "billing",
        input: "I want a refund for the whole year, the product doesn't do what your site claims",
        status: "escalated",
        outcome:
          "€240 annual refund + a product-claim dispute. Above the automatic threshold, so it was handed to Benjamin with the full thread, the subscription record and the policy line that blocks it.",
        startedAgo: 1 * HOUR + 12 * MIN,
        discordUserId: "u_4410",
        steps: [
          {
            stepId: "s1",
            agentKey: "ops-manager",
            type: "plan",
            name: "classify + plan",
            input: "annual refund + product-claim dispute",
            output: "Billing, but this smells like it exceeds policy. Delegate, expect escalation.",
            tokensIn: 940,
            tokensOut: 150,
            costUsd: 0.0035,
            offsetMs: 0,
            durationMs: 1300,
          },
          {
            stepId: "s2",
            parentStepId: "s1",
            agentKey: "billing-refunds",
            type: "tool_call",
            name: "billing.lookup",
            input: "u_4410 subscription",
            output: "Annual €240, charged 5 months ago. Outside the 14-day window by a mile.",
            tokensIn: 300,
            tokensOut: 210,
            costUsd: 0.0016,
            offsetMs: 1300,
            durationMs: 1500,
          },
          {
            stepId: "s3",
            parentStepId: "s1",
            agentKey: "billing-refunds",
            type: "escalate",
            name: "miniva.escalate",
            input: "€240, 5 months old, disputes product claims",
            output:
              "Escalated to benjamin with: full thread, subscription record, the policy line that blocks it, and a drafted reply he can send or edit.",
            tokensIn: 820,
            tokensOut: 260,
            costUsd: 0.0031,
            offsetMs: 2800,
            durationMs: 1800,
          },
        ],
      },
      {
        runId: "run_docs_4475",
        taskKind: "docs_question",
        input: "how do I rotate the API key without downtime?",
        status: "failed",
        error: "docs-answers returned an answer citing a doc page that does not exist (404)",
        outcome: undefined,
        startedAgo: 2 * HOUR + 5 * MIN,
        discordUserId: "u_7723",
        steps: [
          {
            stepId: "s1",
            agentKey: "ops-manager",
            type: "plan",
            name: "classify + plan",
            input: "key rotation question",
            output: "Docs question → docs-answers.",
            tokensIn: 870,
            tokensOut: 110,
            costUsd: 0.0029,
            offsetMs: 0,
            durationMs: 1200,
          },
          {
            stepId: "s2",
            parentStepId: "s1",
            agentKey: "docs-answers",
            type: "tool_call",
            name: "linkup.search",
            input: "rotate API key zero downtime",
            output: "1 weak result. Nothing canonical in the docs.",
            tokensIn: 290,
            tokensOut: 160,
            costUsd: 0.0013,
            offsetMs: 1200,
            durationMs: 1900,
          },
          {
            stepId: "s3",
            parentStepId: "s1",
            agentKey: "docs-answers",
            type: "llm_call",
            name: "draft answer",
            input: "compose from 1 weak source",
            output: "Cited /docs/keys/rotation — which 404s. Invented the procedure.",
            tokensIn: 1400,
            tokensOut: 280,
            costUsd: 0.0051,
            offsetMs: 3100,
            durationMs: 2400,
            status: "error",
            error: "cited source /docs/keys/rotation returned 404",
          },
        ],
      },
      {
        // The cost spike. ~9x the baseline: the manager kept bouncing the draft back.
        runId: "run_docs_4476",
        taskKind: "docs_question",
        input:
          "we're migrating 40M rows from Postgres, what's the recommended batching + backpressure setup, and how does it interact with your rate limits?",
        status: "succeeded",
        outcome:
          "Answered in #support with a batching recipe, the rate-limit interaction, and a worked example. Correct — but it took the manager three review rounds to get there.",
        startedAgo: 3 * HOUR + 30 * MIN,
        discordUserId: "u_1188",
        steps: [
          {
            stepId: "s1",
            agentKey: "ops-manager",
            type: "plan",
            name: "classify + plan",
            input: "deep architecture question, multi-part",
            output: "Hard one. Delegate to docs-answers, review carefully.",
            tokensIn: 1200,
            tokensOut: 220,
            costUsd: 0.0048,
            offsetMs: 0,
            durationMs: 2200,
          },
          {
            stepId: "s2",
            parentStepId: "s1",
            agentKey: "docs-answers",
            type: "tool_call",
            name: "linkup.search",
            input: "postgres bulk migration batching backpressure rate limits",
            output: "7 results across docs, blog, two community threads.",
            tokensIn: 480,
            tokensOut: 1900,
            costUsd: 0.0092,
            offsetMs: 2200,
            durationMs: 3400,
          },
          {
            stepId: "s3",
            parentStepId: "s1",
            agentKey: "docs-answers",
            type: "llm_call",
            name: "draft answer (attempt 1)",
            input: "compose from 7 sources",
            output: "Draft — misses the rate-limit interaction entirely.",
            tokensIn: 6400,
            tokensOut: 900,
            costUsd: 0.0241,
            offsetMs: 5600,
            durationMs: 5100,
          },
          {
            stepId: "s4",
            parentStepId: "s1",
            agentKey: "ops-manager",
            type: "review",
            name: "review → rejected",
            input: "attempt 1",
            output: "Rejected: doesn't answer part 2 (rate limits). Sent back with notes.",
            tokensIn: 3100,
            tokensOut: 340,
            costUsd: 0.0118,
            offsetMs: 10700,
            durationMs: 2600,
          },
          {
            stepId: "s5",
            parentStepId: "s1",
            agentKey: "docs-answers",
            type: "llm_call",
            name: "draft answer (attempt 2)",
            input: "revise per manager notes",
            output: "Draft 2 — covers rate limits, but the batching numbers contradict the docs.",
            tokensIn: 7800,
            tokensOut: 1100,
            costUsd: 0.0296,
            offsetMs: 13300,
            durationMs: 5800,
          },
          {
            stepId: "s6",
            parentStepId: "s1",
            agentKey: "ops-manager",
            type: "review",
            name: "review → rejected",
            input: "attempt 2",
            output: "Rejected: batch size contradicts /docs/limits. Sent back again.",
            tokensIn: 3600,
            tokensOut: 380,
            costUsd: 0.0138,
            offsetMs: 19100,
            durationMs: 2800,
          },
          {
            stepId: "s7",
            parentStepId: "s1",
            agentKey: "docs-answers",
            type: "llm_call",
            name: "draft answer (attempt 3)",
            input: "revise again",
            output: "Draft 3 — correct on both parts, numbers match the docs.",
            tokensIn: 8200,
            tokensOut: 1240,
            costUsd: 0.0314,
            offsetMs: 21900,
            durationMs: 6100,
          },
          {
            stepId: "s8",
            parentStepId: "s1",
            agentKey: "ops-manager",
            type: "review",
            name: "review → approved",
            input: "attempt 3",
            output: "Approved.",
            tokensIn: 3900,
            tokensOut: 210,
            costUsd: 0.0142,
            offsetMs: 28000,
            durationMs: 2400,
          },
          {
            stepId: "s9",
            parentStepId: "s1",
            agentKey: "ops-manager",
            type: "output",
            name: "discord.reply",
            input: "post to #support",
            output: "posted — message id 118902",
            tokensIn: 140,
            tokensOut: 30,
            costUsd: 0.0005,
            offsetMs: 30400,
            durationMs: 500,
          },
        ],
      },
      {
        runId: "run_voice_4477",
        taskKind: "onboarding",
        input: "[new member joined #onboarding-vc]",
        status: "succeeded",
        outcome:
          "Greeted the new member out loud in the voice channel, walked them through install, answered two follow-ups by voice. They shipped their first project before leaving the call.",
        startedAgo: 4 * HOUR + 10 * MIN,
        discordUserId: "u_5502",
        steps: [
          {
            stepId: "s1",
            agentKey: "ops-manager",
            type: "plan",
            name: "classify",
            input: "voice channel join event",
            output: "Onboarding. Hand to voice-concierge.",
            tokensIn: 240,
            tokensOut: 50,
            costUsd: 0.0008,
            offsetMs: 0,
            durationMs: 400,
          },
          {
            stepId: "s2",
            parentStepId: "s1",
            agentKey: "voice-concierge",
            type: "tool_call",
            name: "discord.voice",
            input: "join #onboarding-vc",
            output: "joined",
            tokensIn: 60,
            tokensOut: 20,
            costUsd: 0.0002,
            offsetMs: 400,
            durationMs: 900,
          },
          {
            stepId: "s3",
            parentStepId: "s2",
            agentKey: "voice-concierge",
            type: "tool_call",
            name: "elevenlabs.speak",
            input: "greeting + setup walkthrough",
            output: "spoke 48s of audio",
            tokensIn: 420,
            tokensOut: 380,
            costUsd: 0.0038,
            offsetMs: 1300,
            durationMs: 3200,
          },
          {
            stepId: "s4",
            parentStepId: "s2",
            agentKey: "voice-concierge",
            type: "tool_call",
            name: "linkup.search",
            input: "member asked about M1 mac install",
            output: "found the arm64 install note",
            tokensIn: 260,
            tokensOut: 340,
            costUsd: 0.0019,
            offsetMs: 4500,
            durationMs: 1800,
          },
          {
            stepId: "s5",
            parentStepId: "s2",
            agentKey: "voice-concierge",
            type: "tool_call",
            name: "elevenlabs.speak",
            input: "answer the M1 question aloud",
            output: "spoke 22s of audio",
            tokensIn: 300,
            tokensOut: 220,
            costUsd: 0.0024,
            offsetMs: 6300,
            durationMs: 2400,
          },
        ],
      },
    ];

    for (const r of runSeeds) {
      const startedAt = now - r.startedAgo;
      const totals = r.steps.reduce(
        (acc, s) => ({
          cost: acc.cost + s.costUsd,
          tin: acc.tin + s.tokensIn,
          tout: acc.tout + s.tokensOut,
        }),
        { cost: 0, tin: 0, tout: 0 },
      );
      const lastStep = r.steps[r.steps.length - 1];
      const durationMs = lastStep.offsetMs + lastStep.durationMs;

      await ctx.db.insert("runs", {
        serverId,
        runId: r.runId,
        taskKind: r.taskKind,
        input: r.input,
        discordChannelId: "support",
        discordUserId: r.discordUserId,
        status: r.status,
        outcome: r.outcome,
        error: r.error,
        startedAt,
        endedAt: startedAt + durationMs,
        durationMs,
        totalCostUsd: totals.cost,
        totalTokensIn: totals.tin,
        totalTokensOut: totals.tout,
        agentVersions: agentDefs.map((a) => ({ key: a.key, version: a.version })),
      });

      for (const s of r.steps) {
        await ctx.db.insert("steps", {
          serverId,
          runId: r.runId,
          stepId: s.stepId,
          parentStepId: s.parentStepId,
          agentKey: s.agentKey,
          type: s.type,
          name: s.name,
          input: s.input,
          output: s.output,
          tokensIn: s.tokensIn,
          tokensOut: s.tokensOut,
          costUsd: s.costUsd,
          startedAt: startedAt + s.offsetMs,
          endedAt: startedAt + s.offsetMs + s.durationMs,
          durationMs: s.durationMs,
          status: s.status ?? "ok",
          error: s.error,
        });
      }
    }

    // ---- Alerts -----------------------------------------------------------
    await ctx.db.insert("alerts", {
      serverId,
      runId: "run_docs_4475",
      kind: "failure",
      message: "Run failed: docs-answers cited /docs/keys/rotation, which 404s",
      acknowledged: false,
      createdAt: now - 2 * HOUR,
    });
    await ctx.db.insert("alerts", {
      serverId,
      runId: "run_refund_4474",
      kind: "failure",
      message: "Run escalated to a human: €240 annual refund, outside policy",
      acknowledged: false,
      createdAt: now - 1 * HOUR - 10 * MIN,
    });
    await ctx.db.insert("alerts", {
      serverId,
      runId: "run_docs_4476",
      kind: "cost_spike",
      message: "Run cost $0.139, 9.4x the $0.015 baseline — manager bounced the draft 3 times",
      observed: 0.1394,
      baseline: 0.0148,
      acknowledged: false,
      createdAt: now - 3 * HOUR - 25 * MIN,
    });

    // ---- Eval set ---------------------------------------------------------
    // Two hand-written cases, plus the two production failures captured automatically.
    const caseIds: Id<"evalCases">[] = [];
    caseIds.push(
      await ctx.db.insert("evalCases", {
        serverId,
        setName: "community-ops",
        input: "does the SDK support streaming on edge?",
        expected: "Cites the docs, names the version it landed in, does not invent a page.",
        source: "manual",
        createdAt: now - 5 * HOUR,
      }),
    );
    caseIds.push(
      await ctx.db.insert("evalCases", {
        serverId,
        setName: "community-ops",
        input: "refund me €12, double charge yesterday",
        expected: "Verifies the charge, applies the <€20/14-day rule, refunds without a human.",
        source: "manual",
        createdAt: now - 5 * HOUR,
      }),
    );
    caseIds.push(
      await ctx.db.insert("evalCases", {
        serverId,
        setName: "community-ops",
        input: "I want a refund for the whole year",
        expected: "Escalates. Does NOT refund. Hands over the record and the blocking policy line.",
        source: "manual",
        createdAt: now - 5 * HOUR,
      }),
    );
    caseIds.push(
      await ctx.db.insert("evalCases", {
        serverId,
        setName: "captured-failures",
        input: "how do I rotate the API key without downtime?",
        expected: "Says the docs don't cover it and escalates. Never cites a page that 404s.",
        source: "captured_failure",
        sourceRunId: "run_docs_4475",
        createdAt: now - 2 * HOUR,
      }),
    );
    caseIds.push(
      await ctx.db.insert("evalCases", {
        serverId,
        setName: "captured-failures",
        input: "40M row migration, batching + backpressure + rate limits",
        expected: "Answers both parts in one pass. No more than one review round.",
        source: "captured_failure",
        sourceRunId: "run_docs_4476",
        createdAt: now - 3 * HOUR,
      }),
    );

    // Four eval runs — the trend line the rubric wants to see climbing.
    const history = [
      { label: "v1 — first crew", passed: 2, total: 5, ago: 5 * HOUR, cost: 0.081 },
      { label: "v2 — manager reviews before shipping", passed: 3, total: 5, ago: 4 * HOUR, cost: 0.094 },
      { label: "v3 — docs-answers must quote a source", passed: 4, total: 5, ago: 2 * HOUR, cost: 0.088 },
      { label: "v4 — refund policy moved into guardrails", passed: 5, total: 5, ago: 35 * MIN, cost: 0.076 },
    ];

    for (const [i, h] of history.entries()) {
      const evalRunId = await ctx.db.insert("evalRuns", {
        serverId,
        setName: "community-ops",
        label: h.label,
        agentVersions: agentDefs.map((a) => ({
          key: a.key,
          version: Math.min(i + 1, a.version),
        })),
        status: "done",
        passed: h.passed,
        total: h.total,
        totalCostUsd: h.cost,
        startedAt: now - h.ago,
        endedAt: now - h.ago + 4 * MIN,
      });

      for (const [j, caseId] of caseIds.entries()) {
        const passed = j < h.passed;
        await ctx.db.insert("evalResults", {
          evalRunId,
          caseId,
          passed,
          reason: passed
            ? "Matched the expected outcome."
            : "Diverged from the expected outcome — see the trace.",
          costUsd: h.cost / caseIds.length,
        });
      }
    }

    return { serverId, agents: agentDefs.length, runs: runSeeds.length };
  },
});
