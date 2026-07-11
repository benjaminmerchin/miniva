import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const list = query({
  args: { serverId: v.id("servers"), onlyOpen: v.optional(v.boolean()) },
  handler: async (ctx, { serverId, onlyOpen }) => {
    const alerts = await ctx.db
      .query("alerts")
      .withIndex("by_server", (q) => q.eq("serverId", serverId))
      .order("desc")
      .take(100);
    return onlyOpen ? alerts.filter((a) => !a.acknowledged) : alerts;
  },
});

export const openCount = query({
  args: { serverId: v.id("servers") },
  handler: async (ctx, { serverId }) => {
    const open = await ctx.db
      .query("alerts")
      .withIndex("by_server_ack", (q) => q.eq("serverId", serverId).eq("acknowledged", false))
      .collect();
    return open.length;
  },
});

export const acknowledge = mutation({
  args: { alertId: v.id("alerts") },
  handler: async (ctx, { alertId }) => {
    await ctx.db.patch(alertId, { acknowledged: true });
  },
});
