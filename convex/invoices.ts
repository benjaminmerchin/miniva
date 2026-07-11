import { internalMutation, query } from "./_generated/server";
import { v } from "convex/values";

export const getInvoices = query({
  args: {},
  handler: async (ctx) => {
    // Dans une version plus poussée, on filtrerait par serverId via l'auth Miniva.
    // Pour l'instant, on retourne les factures.
    const invoices = await ctx.db.query("invoices").order("desc").take(100);
    return invoices;
  },
});

export const saveInvoice = internalMutation({
  args: {
    serverId: v.id("servers"),
    discordUserId: v.string(),
    amountHT: v.optional(v.number()),
    amountTTC: v.optional(v.number()),
    tva: v.optional(v.number()),
    date: v.optional(v.string()),
    vendor: v.optional(v.string()),
    category: v.optional(v.string()),
    receiptUrl: v.optional(v.string()),
    status: v.union(v.literal("pending"), v.literal("processed")),
    rawText: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("invoices", {
      ...args,
      createdAt: Date.now(),
    });
  },
});
