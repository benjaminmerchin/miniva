import { useState } from "react";
import { useAction } from "convex/react";
import { motion, AnimatePresence } from "motion/react";
import { Search, ExternalLink } from "lucide-react";
import { api } from "../../convex/_generated/api";

/**
 * The same live web search the assistants use (Linkup), demoable from the
 * dashboard: ask anything, get a sourced answer straight from the live API.
 */
export default function AskTheWeb() {
  const search = useAction(api.linkup.search);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{
    answer: string;
    sources: { name: string; url: string }[];
  } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim() || busy) return;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      setResult(await search({ q }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 rounded-xl border border-line bg-panel p-4">
      <div className="mb-2.5 flex items-baseline justify-between">
        <h2 className="text-[13px] font-medium text-muted">
          Ask the web — the assistants' live search
        </h2>
        <span className="text-[10px] uppercase tracking-wide text-faint">
          powered by Linkup
        </span>
      </div>

      <form onSubmit={submit} className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Search
            size={13}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint"
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="What's the weather in Paris right now?"
            className="w-full rounded-lg border border-line bg-raised py-2 pl-8.5 pr-3 text-[13px] outline-none placeholder:text-faint focus:border-blurple/60"
          />
        </div>
        <button
          type="submit"
          disabled={busy || !q.trim()}
          className="shrink-0 rounded-lg bg-blurple px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-blurple-soft disabled:opacity-50"
        >
          {busy ? "Searching…" : "Search"}
        </button>
      </form>

      <AnimatePresence>
        {error && (
          <p className="mt-3 text-[12px] text-bad">{error}</p>
        )}
        {result && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-3 rounded-lg border border-line-soft bg-ink/50 px-3.5 py-3"
          >
            <p className="text-[13px] leading-relaxed text-fg">{result.answer}</p>
            {!!result.sources.length && (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {result.sources.map((s, i) => (
                  <a
                    key={i}
                    href={s.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex max-w-56 items-center gap-1 truncate rounded border border-line-soft px-2 py-1 text-[11px] text-muted transition-colors hover:text-fg"
                  >
                    <ExternalLink size={10} className="shrink-0" />
                    <span className="truncate">{s.name}</span>
                  </a>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
