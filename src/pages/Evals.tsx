import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { motion } from "motion/react";
import { Play, Plus, Zap } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { usd, ago, pct } from "../lib/format";

export default function Evals({ serverId }: { serverId: Id<"servers"> }) {
  const sets = useQuery(api.evals.sets, { serverId });
  const evalRuns = useQuery(api.evals.runs, { serverId });
  const cases = useQuery(api.evals.cases, { serverId });
  const label = useMutation(api.evals.labelCase);
  const start = useMutation(api.evals.start);

  const [adding, setAdding] = useState(false);

  const captured = cases?.filter((c) => c.source === "captured_failure") ?? [];
  const unlabelled = captured.filter((c) => !c.expected.trim());

  return (
    <div className="px-8 py-7">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[19px] font-semibold tracking-tight">Evals</h1>
          <p className="mt-0.5 text-[13px] text-muted">
            Does this version of the crew actually beat the last one?
          </p>
        </div>
        <button
          onClick={() =>
            start({ serverId, setName: "community-ops", label: "manual run" })
          }
          className="flex items-center gap-1.5 rounded-lg bg-blurple px-3.5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-blurple-soft"
        >
          <Play size={13} />
          Run the set
        </button>
      </div>

      {/* The trend. If this line isn't climbing, the prompts aren't improving. */}
      <section className="mt-6 rounded-xl border border-line bg-panel p-5">
        <h2 className="text-[13px] font-medium text-muted">Score across versions</h2>
        <ScoreTrend runs={evalRuns ?? []} />
      </section>

      {!!unlabelled.length && (
        <section className="mt-6 rounded-xl border border-warn/25 bg-warn/[0.04] px-4 py-3.5">
          <div className="flex items-center gap-2">
            <Zap size={13} className="text-warn" />
            <h2 className="text-[13px] font-medium text-warn">
              {unlabelled.length} production failure
              {unlabelled.length > 1 ? "s" : ""} captured, waiting on you
            </h2>
          </div>
          <p className="mt-1 text-[12px] leading-relaxed text-muted">
            Every run that failed or escalated became a test case automatically. Write
            down what should have happened, and it joins the set forever.
          </p>

          <div className="mt-3 space-y-2">
            {unlabelled.map((c) => (
              <CaptureRow key={c._id} c={c} onLabel={label} />
            ))}
          </div>
        </section>
      )}

      <div className="mt-6 grid grid-cols-[1fr_320px] gap-5">
        <section>
          <h2 className="mb-2.5 text-[13px] font-medium text-muted">Runs of the set</h2>
          <div className="overflow-hidden rounded-xl border border-line bg-panel">
            {evalRuns?.map((r) => {
              const score = r.total ? r.passed / r.total : 0;
              return (
                <div
                  key={r._id}
                  className="flex items-center gap-3 border-b border-line-soft px-4 py-3 last:border-0"
                >
                  <span
                    className={`tnum w-12 shrink-0 rounded px-1.5 py-0.5 text-center text-[11px] font-semibold ${
                      score === 1
                        ? "bg-good/15 text-good"
                        : score >= 0.6
                          ? "bg-warn/15 text-warn"
                          : "bg-bad/15 text-bad"
                    }`}
                  >
                    {r.passed}/{r.total}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px]">{r.label}</span>
                  <span className="tnum shrink-0 text-[11px] text-faint">
                    {usd(r.totalCostUsd)}
                  </span>
                  <span className="tnum shrink-0 text-[11px] text-faint">
                    {ago(r.startedAt)}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        <section>
          <div className="mb-2.5 flex items-center justify-between">
            <h2 className="text-[13px] font-medium text-muted">Sets</h2>
            <button
              onClick={() => setAdding(true)}
              className="flex items-center gap-1 text-[12px] text-faint transition-colors hover:text-fg"
            >
              <Plus size={12} /> Case
            </button>
          </div>

          <div className="space-y-2">
            {sets?.map((s) => (
              <div key={s.setName} className="rounded-xl border border-line bg-panel p-4">
                <div className="flex items-baseline justify-between">
                  <span className="text-[13px] font-medium">{s.setName}</span>
                  <span className="tnum text-[11px] text-muted">{s.total} cases</span>
                </div>
                {!!s.captured && (
                  <p className="mt-1 text-[11px] text-faint">
                    {s.captured} captured from production failures
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>

      {adding && <AddCase serverId={serverId} onClose={() => setAdding(false)} />}
    </div>
  );
}

/**
 * Simple, honest line chart — one point per completed run of the set, oldest on
 * the left. The line lives in a stretched SVG; the dots are HTML laid on top,
 * because circles inside a preserveAspectRatio="none" viewBox get smeared into
 * ellipses — which is exactly the bug this replaced.
 */
function ScoreTrend({ runs }: { runs: any[] }) {
  const points = [...runs].reverse().filter((r) => r.status === "done" && r.total > 0);
  if (points.length < 2) {
    return (
      <p className="py-8 text-center text-[12px] text-faint">
        Run the set twice to see a trend.
      </p>
    );
  }

  // Percent coordinates with padding so a perfect score isn't clipped at the top.
  const PX = 3;
  const PY = 10;
  const coords = points.map((r, i) => ({
    x: PX + (i / (points.length - 1)) * (100 - 2 * PX),
    y: 100 - PY - (r.passed / r.total) * (100 - 2 * PY),
    run: r,
  }));
  const path = coords
    .map((c, i) => `${i ? "L" : "M"} ${c.x.toFixed(2)} ${c.y.toFixed(2)}`)
    .join(" ");

  const first = points[0];
  const last = points.at(-1)!;
  const gain = last.passed / last.total - first.passed / first.total;

  return (
    <div className="mt-3">
      <div className="flex items-baseline gap-2">
        <span className="tnum text-[24px] font-semibold">
          {last.passed}/{last.total}
        </span>
        <span
          className={`tnum text-[12px] font-medium ${gain > 0 ? "text-good" : gain < 0 ? "text-bad" : "text-muted"}`}
        >
          {gain > 0 ? "+" : ""}
          {pct(gain)} since {first.label.split("—")[0].trim()}
        </span>
      </div>

      <div className="relative mt-3 h-28">
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full"
        >
          {/*
            No non-scaling-stroke here: Chrome renders it as broken dashes when
            the viewBox is stretched. ViewBox-unit stroke on a shallow line
            stays visually ~1.5px.
          */}
          <path d={path} fill="none" stroke="#5865f2" strokeWidth={1.5} />
        </svg>
        {coords.map((c, i) => (
          <span
            key={i}
            title={`${c.run.passed}/${c.run.total} — ${c.run.label}`}
            className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-blurple ring-2 ring-panel"
            style={{ left: `${c.x}%`, top: `${c.y}%` }}
          />
        ))}
      </div>

      <div className="mt-2 flex justify-between gap-2">
        {points.map((r) => (
          <span key={r._id} className="min-w-0 flex-1 truncate text-[10px] text-faint">
            {r.label.split("—")[0].trim()}
          </span>
        ))}
      </div>
    </div>
  );
}

function CaptureRow({ c, onLabel }: { c: any; onLabel: any }) {
  const [expected, setExpected] = useState("");
  const [saved, setSaved] = useState(false);

  if (saved) return null;

  return (
    <div className="rounded-lg border border-line bg-panel px-3.5 py-3">
      <p className="text-[12px] text-fg">{c.input}</p>
      <p className="mt-0.5 text-[11px] text-faint">
        from run {c.sourceRunId} · {ago(c.createdAt)}
      </p>
      <div className="mt-2 flex gap-2">
        <input
          value={expected}
          onChange={(e) => setExpected(e.target.value)}
          placeholder="What should the crew have done?"
          className="min-w-0 flex-1 rounded-md border border-line bg-raised px-2.5 py-1.5 text-[12px] outline-none placeholder:text-faint focus:border-blurple/60"
        />
        <button
          onClick={async () => {
            if (!expected.trim()) return;
            await onLabel({ caseId: c._id, expected });
            setSaved(true);
          }}
          className="shrink-0 rounded-md bg-blurple px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-blurple-soft"
        >
          Add to set
        </button>
      </div>
    </div>
  );
}

function AddCase({
  serverId,
  onClose,
}: {
  serverId: Id<"servers">;
  onClose: () => void;
}) {
  const add = useMutation(api.evals.addCase);
  const [input, setInput] = useState("");
  const [expected, setExpected] = useState("");

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-6 backdrop-blur-sm"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl border border-line bg-panel p-6"
      >
        <h2 className="text-[15px] font-semibold">New test case</h2>
        <p className="mt-0.5 text-[12px] text-faint">
          A message the crew should handle, and what handling it well looks like.
        </p>

        <div className="mt-4 space-y-3">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={2}
            placeholder="refund me €12, I was double charged yesterday"
            className="w-full resize-none rounded-lg border border-line bg-raised px-3 py-2.5 text-[13px] outline-none placeholder:text-faint focus:border-blurple/60"
          />
          <textarea
            value={expected}
            onChange={(e) => setExpected(e.target.value)}
            rows={2}
            placeholder="Verifies the charge, applies the <€20/14-day rule, refunds without a human."
            className="w-full resize-none rounded-lg border border-line bg-raised px-3 py-2.5 text-[13px] outline-none placeholder:text-faint focus:border-blurple/60"
          />
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-[13px] text-muted hover:text-fg"
          >
            Cancel
          </button>
          <button
            onClick={async () => {
              if (!input.trim() || !expected.trim()) return;
              await add({ serverId, setName: "community-ops", input, expected });
              onClose();
            }}
            className="rounded-md bg-blurple px-4 py-1.5 text-[13px] font-medium text-white hover:bg-blurple-soft"
          >
            Add case
          </button>
        </div>
      </motion.div>
    </div>
  );
}
