import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const get = query({
  args: { serverId: v.id("servers") },
  handler: async (ctx, { serverId }) => await ctx.db.get(serverId),
});

export const byGuild = query({
  args: { guildId: v.string() },
  handler: async (ctx, { guildId }) =>
    await ctx.db
      .query("servers")
      .withIndex("by_guild", (q) => q.eq("guildId", guildId))
      .unique(),
});

export const listForOwner = query({
  args: { ownerDiscordId: v.string() },
  handler: async (ctx, { ownerDiscordId }) =>
    await ctx.db
      .query("servers")
      .withIndex("by_owner", (q) => q.eq("ownerDiscordId", ownerDiscordId))
      .collect(),
});

/** Any server, newest first — what the demo lands on when there's no auth yet. */
export const first = query({
  args: {},
  handler: async (ctx) => await ctx.db.query("servers").order("desc").first(),
});

/**
 * Called at the end of the wizard. The server sits in `provisioning` until the
 * Hermes box reports in on POST /v1/provisioned.
 */
export const connect = mutation({
  args: {
    guildId: v.string(),
    name: v.string(),
    iconUrl: v.optional(v.string()),
    ownerDiscordId: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("servers")
      .withIndex("by_guild", (q) => q.eq("guildId", args.guildId))
      .unique();
    if (existing) return existing._id;

    return await ctx.db.insert("servers", {
      ...args,
      status: "provisioning",
      ingestKey: `mnv_${crypto.randomUUID().replace(/-/g, "")}`,
      plan: "free",
      createdAt: Date.now(),
    });
  },
});

export const setPlan = mutation({
  args: { serverId: v.id("servers"), plan: v.union(v.literal("free"), v.literal("pro")) },
  handler: async (ctx, { serverId, plan }) => {
    await ctx.db.patch(serverId, { plan });
  },
});
