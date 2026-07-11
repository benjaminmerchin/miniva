import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const guardrailsValidator = v.object({
  maxCostUsd: v.number(),
  maxSteps: v.number(),
  requiresHumanApproval: v.boolean(),
  allowedChannelIds: v.array(v.string()),
  escalateToDiscordUserId: v.optional(v.string()),
});

export const listForServer = query({
  args: { serverId: v.id("servers") },
  handler: async (ctx, { serverId }) =>
    await ctx.db
      .query("agents")
      .withIndex("by_server", (q) => q.eq("serverId", serverId))
      .collect(),
});

export const get = query({
  args: { agentId: v.id("agents") },
  handler: async (ctx, { agentId }) => await ctx.db.get(agentId),
});

/**
 * Creating a role is the thing a non-engineer does in under 10 minutes:
 * name it, describe the job, pick tools, set guardrails. No code, no deploy —
 * Hermes re-reads /v1/config and the role is live.
 */
export const create = mutation({
  args: {
    serverId: v.id("servers"),
    name: v.string(),
    role: v.union(v.literal("manager"), v.literal("specialist")),
    job: v.string(),
    tools: v.array(v.string()),
    guardrails: guardrailsValidator,
    model: v.string(),
  },
  handler: async (ctx, args) => {
    const key = slugify(args.name);
    const clash = await ctx.db
      .query("agents")
      .withIndex("by_server_key", (q) => q.eq("serverId", args.serverId).eq("key", key))
      .unique();
    if (clash) throw new Error(`An agent named "${args.name}" already exists`);

    const now = Date.now();
    const agentId = await ctx.db.insert("agents", {
      ...args,
      key,
      version: 1,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("agentVersions", {
      agentId,
      serverId: args.serverId,
      version: 1,
      job: args.job,
      tools: args.tools,
      guardrails: args.guardrails,
      model: args.model,
      createdAt: now,
    });

    return agentId;
  },
});

/** Every edit bumps the version and snapshots the old one. Prompts are versioned. */
export const update = mutation({
  args: {
    agentId: v.id("agents"),
    job: v.string(),
    tools: v.array(v.string()),
    guardrails: guardrailsValidator,
    model: v.string(),
  },
  handler: async (ctx, { agentId, ...next }) => {
    const agent = await ctx.db.get(agentId);
    if (!agent) throw new Error("agent not found");

    const unchanged =
      agent.job === next.job &&
      agent.model === next.model &&
      JSON.stringify(agent.tools) === JSON.stringify(next.tools) &&
      JSON.stringify(agent.guardrails) === JSON.stringify(next.guardrails);
    if (unchanged) return agent.version;

    const version = agent.version + 1;
    const now = Date.now();

    await ctx.db.patch(agentId, { ...next, version, updatedAt: now });
    await ctx.db.insert("agentVersions", {
      agentId,
      serverId: agent.serverId,
      version,
      ...next,
      createdAt: now,
    });

    return version;
  },
});

export const setEnabled = mutation({
  args: { agentId: v.id("agents"), enabled: v.boolean() },
  handler: async (ctx, { agentId, enabled }) => {
    await ctx.db.patch(agentId, { enabled, updatedAt: Date.now() });
  },
});

export const remove = mutation({
  args: { agentId: v.id("agents") },
  handler: async (ctx, { agentId }) => {
    await ctx.db.delete(agentId);
  },
});

export const versionHistory = query({
  args: { agentId: v.id("agents") },
  handler: async (ctx, { agentId }) =>
    await ctx.db
      .query("agentVersions")
      .withIndex("by_agent", (q) => q.eq("agentId", agentId))
      .order("desc")
      .collect(),
});

function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

/**
 * The tools a role can be given. Three of these are partner integrations doing
 * real work inside the agents, which is exactly what the power-up rules ask for.
 */
export const TOOL_CATALOG = [
  { id: "discord.reply", label: "Reply in channel", blurb: "Post a message back to the thread" },
  { id: "discord.react", label: "React to message", blurb: "Add an emoji reaction" },
  { id: "discord.thread", label: "Open a thread", blurb: "Spin a thread off a message" },
  { id: "discord.role", label: "Assign a role", blurb: "Grant or remove a member role" },
  { id: "discord.moderate", label: "Moderate", blurb: "Delete, timeout, warn" },
  { id: "discord.voice", label: "Join voice", blurb: "Join a voice channel and listen" },
  { id: "linkup.search", label: "Search the web", blurb: "Live web search via Linkup" },
  { id: "elevenlabs.speak", label: "Speak aloud", blurb: "Answer with a real voice via ElevenLabs" },
  { id: "miniva.escalate", label: "Escalate to a human", blurb: "Hand off with full context" },
] as const;

export const toolCatalog = query({
  args: {},
  handler: async () => TOOL_CATALOG,
});

/**
 * Roles you can hire in one click. Each one is a complete definition — job,
 * tools, guardrails — so a non-engineer gets a working agent without writing a
 * prompt. They're a starting point: everything stays editable afterwards.
 */
export const AGENT_LIBRARY = [
  {
    slug: "trip-organizer",
    name: "Trip Organizer",
    blurb: "Plans the trip, prices it, and keeps the thread up to date.",
    role: "specialist" as const,
    job: "Plan trips end to end. Search live for flights, trains and stays, compare them on price and travel time, and come back with two or three concrete options — never a vague list. Say what each one costs and why you'd pick it. If dates or budget are missing, ask once, then plan.",
    tools: ["linkup.search", "discord.reply", "discord.thread"],
    guardrails: {
      maxCostUsd: 0.4,
      maxSteps: 20,
      requiresHumanApproval: false,
      allowedChannelIds: [],
    },
  },
  {
    slug: "accountant",
    name: "Accountant",
    blurb: "Categorises spend, tracks the burn, answers what things cost.",
    role: "specialist" as const,
    job: "Keep the books legible. Categorise expenses as they come in, flag anything that looks duplicated or out of pattern, and answer questions about what has been spent and where. Give numbers, not adjectives. When a figure depends on an assumption, say which.",
    tools: ["linkup.search", "discord.reply"],
    guardrails: {
      maxCostUsd: 0.3,
      maxSteps: 15,
      requiresHumanApproval: false,
      allowedChannelIds: [],
    },
  },
  {
    slug: "tax",
    name: "Tax",
    blurb: "Answers tax questions with the current rules, and knows when to stop.",
    role: "specialist" as const,
    job: "Answer tax questions using the rules that are actually in force this year — always search for the current figures rather than trusting memory, because thresholds move. Quote the source. You are not a licensed advisor: for anything that turns on someone's personal situation, or where being wrong is expensive, say so plainly and escalate to a human instead of guessing.",
    tools: ["linkup.search", "discord.reply", "miniva.escalate"],
    guardrails: {
      maxCostUsd: 0.5,
      maxSteps: 20,
      requiresHumanApproval: false,
      allowedChannelIds: [],
    },
  },
] as const;

export const library = query({
  args: {},
  handler: async () => AGENT_LIBRARY,
});

/** Hire a role from the library. Idempotent on the name. */
export const hire = mutation({
  args: { serverId: v.id("servers"), slug: v.string() },
  handler: async (ctx, { serverId, slug }) => {
    const preset = AGENT_LIBRARY.find((a) => a.slug === slug);
    if (!preset) throw new Error(`No such role: ${slug}`);

    const key = slugify(preset.name);
    const existing = await ctx.db
      .query("agents")
      .withIndex("by_server_key", (q) => q.eq("serverId", serverId).eq("key", key))
      .unique();
    if (existing) return existing._id;

    const now = Date.now();
    const agentId = await ctx.db.insert("agents", {
      serverId,
      key,
      name: preset.name,
      role: preset.role,
      job: preset.job,
      tools: [...preset.tools],
      guardrails: { ...preset.guardrails, allowedChannelIds: [] },
      model: "gpt-5.5",
      version: 1,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("agentVersions", {
      agentId,
      serverId,
      version: 1,
      job: preset.job,
      tools: [...preset.tools],
      guardrails: { ...preset.guardrails, allowedChannelIds: [] },
      model: "gpt-5.5",
      createdAt: now,
    });

    return agentId;
  },
});
