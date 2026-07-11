import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

/**
 * Signups are verified live in the database during judging, not from a
 * screenshot — so this table has to be the real thing, and team emails have to
 * be distinguishable from real ones.
 */
export const create = mutation({
  args: {
    email: v.string(),
    source: v.optional(v.string()),
  },
  handler: async (ctx, { email, source }) => {
    const normalized = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized)) {
      throw new Error("That doesn't look like an email address.");
    }

    const existing = await ctx.db
      .query("signups")
      .withIndex("by_email", (q) => q.eq("email", normalized))
      .unique();
    if (existing) return existing._id;

    return await ctx.db.insert("signups", {
      email: normalized,
      source,
      activated: false,
      createdAt: Date.now(),
    });
  },
});

export const count = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("signups").collect();
    return { total: all.length, activated: all.filter((s) => s.activated).length };
  },
});
