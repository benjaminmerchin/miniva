export const usd = (n: number) =>
  n >= 1 ? `$${n.toFixed(2)}` : n >= 0.001 ? `$${n.toFixed(3)}` : `$${n.toFixed(4)}`;

export const tokens = (n: number) =>
  n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);

export const duration = (ms?: number) => {
  if (!ms) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
};

export const ago = (ts: number) => {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86_400)}d ago`;
};

export const pct = (n: number) => `${Math.round(n * 100)}%`;

export const STATUS_STYLE: Record<string, { dot: string; text: string; label: string }> = {
  running: { dot: "bg-info", text: "text-info", label: "running" },
  succeeded: { dot: "bg-good", text: "text-good", label: "succeeded" },
  failed: { dot: "bg-bad", text: "text-bad", label: "failed" },
  escalated: { dot: "bg-warn", text: "text-warn", label: "escalated" },
};

export const STEP_STYLE: Record<string, { color: string; glyph: string }> = {
  plan: { color: "text-blurple-soft", glyph: "◆" },
  delegate: { color: "text-blurple-soft", glyph: "→" },
  llm_call: { color: "text-info", glyph: "◇" },
  tool_call: { color: "text-good", glyph: "⚙" },
  handoff: { color: "text-warn", glyph: "⇄" },
  review: { color: "text-blurple-soft", glyph: "✓" },
  escalate: { color: "text-warn", glyph: "▲" },
  output: { color: "text-fg", glyph: "●" },
};
