import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "convex/react";
import { motion, AnimatePresence } from "motion/react";
import { ChevronRight, GitCompare, AlertTriangle } from "lucide-react";
import { api } from "../../convex/_generated/api";
import { usd, tokens, duration, ago, STATUS_STYLE, STEP_STYLE } from "../lib/format";

type Node = {
  _id: string;
  stepId: string;
  agentKey: string;
  type: string;
  name: string;
  input: string;
  output: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  subtreeCostUsd: number;
  startedAt: number;
  durationMs?: number;
  status: string;
  error?: string;
  depth: number;
  children: Node[];
};

export default function RunDetail() {
  const { runId } = useParams<{ runId: string }>();
  const data = useQuery(api.runs.detail, runId ? { runId } : "skip");

  if (data === undefined) {
    return <div className="px-8 py-7 text-[13px] text-faint">Loading trace…</div>;
  }
  if (data === null) {
    return <div className="px-8 py-7 text-[13px] text-faint">No run {runId}.</div>;
  }

  const { run, tree, agentBreakdown, stepCount } = data;
  const s = STATUS_STYLE[run.status];

  // The waterfall bars are drawn against the run's own wall-clock span.
  const t0 = run.startedAt;
  const span = run.durationMs || 1;

  return (
    <div className="px-8 py-7">
      <Link
        to="/app/runs"
        className="text-[12px] text-faint transition-colors hover:text-fg"
      >
        ← Runs
      </Link>

      <div className="mt-3 flex items-start justify-between gap-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 shrink-0 rounded-full ${s.dot}`} />
            <span className={`text-[12px] font-medium ${s.text}`}>{s.label}</span>
            <span className="text-[12px] text-faint">·</span>
            <span className="rounded bg-raised px-1.5 py-0.5 text-[11px] text-muted">
              {run.taskKind}
            </span>
            <span className="text-[12px] text-faint">{ago(run.startedAt)}</span>
          </div>
          <h1 className="mt-2 text-[19px] font-semibold leading-snug tracking-tight">
            {run.input}
          </h1>
        </div>

        <Link
          to={`/app/runs/compare?a=${run.runId}`}
          className="flex shrink-0 items-center gap-1.5 rounded-md border border-line bg-panel px-3 py-1.5 text-[12px] text-muted transition-colors hover:border-line hover:text-fg"
        >
          <GitCompare size={13} />
          Diff against another run
        </Link>
      </div>

      {run.error && (
        <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-bad/25 bg-bad/[0.04] px-3.5 py-2.5">
          <AlertTriangle size={14} className="mt-px shrink-0 text-bad" />
          <span className="text-[13px] text-bad">{run.error}</span>
        </div>
      )}

      {run.outcome && (
        <div className="mt-4 rounded-lg border border-line bg-panel px-4 py-3">
          <div className="text-[11px] font-medium uppercase tracking-wide text-faint">
            What landed on the real surface
          </div>
          <p className="mt-1.5 text-[13px] leading-relaxed text-fg">{run.outcome}</p>
        </div>
      )}

      <div className="mt-5 grid grid-cols-4 gap-3">
        <Metric label="Duration" value={duration(run.durationMs)} />
        <Metric label="Cost" value={usd(run.totalCostUsd)} />
        <Metric
          label="Tokens"
          value={`${tokens(run.totalTokensIn)} in / ${tokens(run.totalTokensOut)} out`}
        />
        <Metric label="Steps" value={String(stepCount)} />
      </div>

      <div className="mt-7 grid grid-cols-[1fr_240px] gap-6">
        <section>
          <h2 className="mb-3 text-[13px] font-medium text-muted">
            Trace — who called whom
          </h2>
          <div className="overflow-hidden rounded-xl border border-line bg-panel">
            {(tree as unknown as Node[]).map((node) => (
              <TraceRow key={node.stepId} node={node} t0={t0} span={span} />
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-[13px] font-medium text-muted">Cost by agent</h2>
          <div className="rounded-xl border border-line bg-panel p-4">
            {agentBreakdown.map((a) => {
              const share = run.totalCostUsd ? a.costUsd / run.totalCostUsd : 0;
              return (
                <div key={a.agentKey} className="mb-3.5 last:mb-0">
                  <div className="flex items-baseline justify-between">
                    <span className="truncate text-[12px] text-fg">{a.agentKey}</span>
                    <span className="tnum ml-2 shrink-0 text-[11px] text-muted">
                      {usd(a.costUsd)}
                    </span>
                  </div>
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-line-soft">
                    <motion.div
                      className="h-full rounded-full bg-blurple"
                      initial={{ width: 0 }}
                      animate={{ width: `${share * 100}%` }}
                      transition={{ duration: 0.5, ease: "easeOut" }}
                    />
                  </div>
                  <div className="tnum mt-1 text-[10px] text-faint">
                    {a.steps} steps · {tokens(a.tokens)} tok
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}

function TraceRow({ node, t0, span }: { node: Node; t0: number; span: number }) {
  const [open, setOpen] = useState(false);
  const style = STEP_STYLE[node.type] ?? STEP_STYLE.output;
  const hasKids = node.children.length > 0;

  const offsetPct = ((node.startedAt - t0) / span) * 100;
  const widthPct = Math.max(((node.durationMs ?? 0) / span) * 100, 0.8);

  return (
    <>
      <div
        onClick={() => setOpen((o) => !o)}
        className="flex cursor-pointer items-center gap-2 border-b border-line-soft px-3 py-2 transition-colors last:border-0 hover:bg-raised/50"
        style={{ paddingLeft: 12 + node.depth * 18 }}
      >
        <ChevronRight
          size={12}
          className={`shrink-0 text-faint transition-transform ${open ? "rotate-90" : ""}`}
        />
        <span className={`shrink-0 text-[11px] ${style.color}`}>{style.glyph}</span>

        <span className="w-32 shrink-0 truncate text-[12px] font-medium">
          {node.agentKey}
        </span>
        <span className="min-w-0 flex-1 truncate text-[12px] text-muted">{node.name}</span>

        {/* Waterfall: where in the run this step actually happened. */}
        <div className="relative h-1 w-28 shrink-0 rounded-full bg-line-soft">
          <div
            className={`absolute h-full rounded-full ${
              node.status === "error" ? "bg-bad" : "bg-blurple/70"
            }`}
            style={{ left: `${offsetPct}%`, width: `${widthPct}%` }}
          />
        </div>

        <span className="tnum w-12 shrink-0 text-right text-[11px] text-faint">
          {duration(node.durationMs)}
        </span>
        <span
          className="tnum w-14 shrink-0 text-right text-[11px] text-muted"
          title={hasKids ? `${usd(node.subtreeCostUsd)} including children` : undefined}
        >
          {usd(node.costUsd)}
        </span>
        {node.status === "error" && (
          <span className="shrink-0 rounded bg-bad/15 px-1 text-[10px] font-semibold text-bad">
            ERR
          </span>
        )}
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden border-b border-line-soft bg-ink/60"
          >
            <div
              className="space-y-2.5 px-4 py-3"
              style={{ paddingLeft: 40 + node.depth * 18 }}
            >
              <Field label="Input" value={node.input} />
              <Field label="Output" value={node.output} tone={node.status === "error" ? "bad" : undefined} />
              {node.error && <Field label="Error" value={node.error} tone="bad" />}
              <div className="tnum flex gap-4 pt-0.5 text-[10px] text-faint">
                <span>{tokens(node.tokensIn)} in</span>
                <span>{tokens(node.tokensOut)} out</span>
                <span>{usd(node.costUsd)}</span>
                <span>step {node.stepId}</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {node.children.map((c) => (
        <TraceRow key={c.stepId} node={c} t0={t0} span={span} />
      ))}
    </>
  );
}

function Field({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "bad";
}) {
  return (
    <div>
      <div className="text-[10px] font-medium uppercase tracking-wide text-faint">
        {label}
      </div>
      <p
        className={`mt-0.5 whitespace-pre-wrap text-[12px] leading-relaxed ${
          tone === "bad" ? "text-bad" : "text-muted"
        }`}
      >
        {value || "—"}
      </p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-panel px-3.5 py-2.5">
      <div className="text-[10px] font-medium uppercase tracking-wide text-faint">
        {label}
      </div>
      <div className="tnum mt-1 text-[15px] font-medium">{value}</div>
    </div>
  );
}
