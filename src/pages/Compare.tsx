import { useSearchParams } from "react-router-dom";
import { useQuery } from "convex/react";
import { motion } from "motion/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { usd, duration, ago, STATUS_STYLE, STEP_STYLE } from "../lib/format";

/**
 * Two runs, side by side, with the exact step where they stopped doing the same
 * thing. This is how you explain a regression without reading two logs.
 */
export default function Compare({ serverId }: { serverId: Id<"servers"> }) {
  const [params, setParams] = useSearchParams();
  const a = params.get("a") ?? "";
  const b = params.get("b") ?? "";

  const runs = useQuery(api.runs.list, { serverId, limit: 100 });
  const diff = useQuery(
    api.runs.compare,
    a && b ? { runIdA: a, runIdB: b } : "skip",
  );

  const pick = (side: "a" | "b", runId: string) => {
    const next = new URLSearchParams(params);
    next.set(side, runId);
    setParams(next, { replace: true });
  };

  return (
    <div className="px-8 py-7">
      <h1 className="text-[19px] font-semibold tracking-tight">Diff runs</h1>
      <p className="mt-0.5 text-[13px] text-muted">
        Pick two runs. Miniva finds the step where they diverged.
      </p>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <RunPicker label="Baseline" runs={runs} value={a} onChange={(v) => pick("a", v)} />
        <RunPicker label="Compare to" runs={runs} value={b} onChange={(v) => pick("b", v)} />
      </div>

      {!a || !b ? (
        <div className="mt-6 rounded-xl border border-dashed border-line bg-panel/40 px-4 py-14 text-center text-[13px] text-faint">
          Choose a run on each side.
        </div>
      ) : diff === undefined ? (
        <div className="mt-6 text-[13px] text-faint">Diffing…</div>
      ) : diff === null ? (
        <div className="mt-6 text-[13px] text-faint">One of those runs is gone.</div>
      ) : (
        <>
          <div className="mt-5 grid grid-cols-3 gap-3">
            <Delta
              label="Cost"
              value={usd(Math.abs(diff.delta.costUsd))}
              sign={diff.delta.costUsd}
              invert
            />
            <Delta
              label="Duration"
              value={duration(Math.abs(diff.delta.durationMs))}
              sign={diff.delta.durationMs}
              invert
            />
            <Delta
              label="Steps"
              value={String(Math.abs(diff.delta.steps))}
              sign={diff.delta.steps}
              invert
            />
          </div>

          {diff.divergedAt !== null && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-5 rounded-lg border border-warn/30 bg-warn/[0.05] px-4 py-2.5 text-[13px] text-warn"
            >
              The two runs did the same thing for {diff.divergedAt} step
              {diff.divergedAt === 1 ? "" : "s"}, then diverged at step{" "}
              {diff.divergedAt + 1}.
            </motion.div>
          )}

          <div className="mt-4 grid grid-cols-2 gap-3">
            <Column side={diff.a} divergedAt={diff.divergedAt} />
            <Column side={diff.b} divergedAt={diff.divergedAt} />
          </div>
        </>
      )}
    </div>
  );
}

function RunPicker({
  label,
  runs,
  value,
  onChange,
}: {
  label: string;
  runs: any[] | undefined;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-faint">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-line bg-panel px-3 py-2.5 text-[13px] outline-none focus:border-blurple/60"
      >
        <option value="">Select a run…</option>
        {runs?.map((r) => (
          <option key={r._id} value={r.runId}>
            [{r.status}] {r.input.slice(0, 60)} · {usd(r.totalCostUsd)}
          </option>
        ))}
      </select>
    </label>
  );
}

function Delta({
  label,
  value,
  sign,
  invert,
}: {
  label: string;
  value: string;
  sign: number;
  invert?: boolean;
}) {
  // For cost / duration / steps, more is worse.
  const worse = invert ? sign > 0 : sign < 0;
  const tone = sign === 0 ? "text-muted" : worse ? "text-bad" : "text-good";
  const arrow = sign === 0 ? "=" : sign > 0 ? "+" : "−";

  return (
    <div className="rounded-lg border border-line bg-panel px-3.5 py-2.5">
      <div className="text-[10px] font-medium uppercase tracking-wide text-faint">
        {label}
      </div>
      <div className={`tnum mt-1 text-[15px] font-medium ${tone}`}>
        {arrow}
        {value}
      </div>
    </div>
  );
}

function Column({ side, divergedAt }: { side: any; divergedAt: number | null }) {
  const s = STATUS_STYLE[side.run.status];

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-panel">
      <div className="border-b border-line px-4 py-3">
        <div className="flex items-center gap-2">
          <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
          <span className={`text-[11px] font-medium ${s.text}`}>{s.label}</span>
          <span className="text-[11px] text-faint">{ago(side.run.startedAt)}</span>
        </div>
        <p className="mt-1 truncate text-[13px]">{side.run.input}</p>
        <p className="tnum mt-1 text-[11px] text-faint">
          {usd(side.run.totalCostUsd)} · {duration(side.run.durationMs)} ·{" "}
          {side.steps.length} steps
        </p>
      </div>

      {side.steps.map((step: any, i: number) => {
        const style = STEP_STYLE[step.type] ?? STEP_STYLE.output;
        const diverged = divergedAt !== null && i >= divergedAt;

        return (
          <div
            key={step._id}
            className={`flex items-center gap-2 border-b border-line-soft px-4 py-2 last:border-0 ${
              diverged ? "bg-warn/[0.04]" : ""
            }`}
          >
            <span className="tnum w-5 shrink-0 text-[10px] text-faint">{i + 1}</span>
            <span className={`shrink-0 text-[11px] ${style.color}`}>{style.glyph}</span>
            <span className="w-28 shrink-0 truncate text-[12px]">{step.agentKey}</span>
            <span className="min-w-0 flex-1 truncate text-[12px] text-muted">
              {step.name}
            </span>
            <span className="tnum shrink-0 text-[11px] text-faint">
              {usd(step.costUsd)}
            </span>
            {step.status === "error" && (
              <span className="shrink-0 rounded bg-bad/15 px-1 text-[10px] font-semibold text-bad">
                ERR
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
