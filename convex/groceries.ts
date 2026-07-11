import { query } from "./_generated/server";

export const getGroceries = query({
  args: {},
  handler: async (ctx) => {
    // For the UI dashboard, just fetch the most recent items
    const groceries = await ctx.db
      .query("groceries")
      .order("desc")
      .take(100);
    return groceries;
  },
});
