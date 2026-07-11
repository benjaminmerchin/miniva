import { v } from "convex/values";
import { action } from "./_generated/server";

/**
 * Live web search through Linkup. The same call the agents' `linkup.search`
 * tool makes on the Hermes side — exposed here so the dashboard can demo it
 * against the real API, key server-side only.
 */
export const search = action({
  args: { q: v.string() },
  handler: async (_ctx, { q }) => {
    const key = process.env.LINKUP_API_KEY;
    if (!key) throw new Error("LINKUP_API_KEY is not configured");

    const res = await fetch("https://api.linkup.so/v1/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ q, depth: "standard", outputType: "sourcedAnswer" }),
    });
    if (!res.ok) throw new Error(`Linkup answered ${res.status}`);

    const d = await res.json();
    return {
      answer: (d.answer as string) ?? "",
      sources: ((d.sources as Array<{ name?: string; url?: string }>) ?? [])
        .slice(0, 4)
        .map((s) => ({ name: s.name ?? s.url ?? "source", url: s.url ?? "" })),
    };
  },
});
