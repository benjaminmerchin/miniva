import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

/**
 * Storage layer for the Google Calendar OAuth broker (routes in convex/http.ts).
 *
 * Miniva owns the single Google OAuth app; each end user's refresh token lives
 * here, keyed by (server, userHandle). Hermes boxes never see refresh tokens —
 * they exchange their ingest key for short-lived access tokens on demand.
 */

const STATE_TTL_MS = 15 * 60 * 1000;

export const createState = internalMutation({
  args: {
    state: v.string(),
    serverId: v.id("servers"),
    userHandle: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("oauthStates", { ...args, createdAt: Date.now() });
  },
});

/** Single-use: the row is deleted on read, expired states return null. */
export const consumeState = internalMutation({
  args: { state: v.string() },
  handler: async (ctx, { state }) => {
    const row = await ctx.db
      .query("oauthStates")
      .withIndex("by_state", (q) => q.eq("state", state))
      .unique();
    if (!row) return null;
    await ctx.db.delete(row._id);
    if (Date.now() - row.createdAt > STATE_TTL_MS) return null;
    return { serverId: row.serverId, userHandle: row.userHandle };
  },
});

export const upsertToken = internalMutation({
  args: {
    serverId: v.id("servers"),
    userHandle: v.string(),
    email: v.optional(v.string()),
    refreshToken: v.string(),
    scope: v.string(),
  },
  handler: async (ctx, { serverId, userHandle, email, refreshToken, scope }) => {
    const existing = await ctx.db
      .query("googleTokens")
      .withIndex("by_server_user", (q) =>
        q.eq("serverId", serverId).eq("userHandle", userHandle),
      )
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        email: email ?? existing.email,
        refreshToken,
        scope,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("googleTokens", {
        serverId,
        userHandle,
        email,
        refreshToken,
        scope,
        connectedAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
  },
});

export const tokenRecord = internalQuery({
  args: { serverId: v.id("servers"), userHandle: v.string() },
  handler: async (ctx, { serverId, userHandle }) =>
    await ctx.db
      .query("googleTokens")
      .withIndex("by_server_user", (q) =>
        q.eq("serverId", serverId).eq("userHandle", userHandle),
      )
      .unique(),
});

export const listConnected = internalQuery({
  args: { serverId: v.id("servers") },
  handler: async (ctx, { serverId }) => {
    const rows = await ctx.db
      .query("googleTokens")
      .withIndex("by_server_user", (q) => q.eq("serverId", serverId))
      .collect();
    return rows.map((r) => ({
      userHandle: r.userHandle,
      email: r.email,
      connectedAt: r.connectedAt,
    }));
  },
});

export const deleteToken = internalMutation({
  args: { serverId: v.id("servers"), userHandle: v.string() },
  handler: async (ctx, { serverId, userHandle }) => {
    const row = await ctx.db
      .query("googleTokens")
      .withIndex("by_server_user", (q) =>
        q.eq("serverId", serverId).eq("userHandle", userHandle),
      )
      .unique();
    if (row) await ctx.db.delete(row._id);
    return !!row;
  },
});
