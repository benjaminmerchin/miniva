import { useQuery } from "convex/react";
import { Link } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { usd, duration, pct, ago, STATUS_STYLE } from "../lib/format";
import AskTheWeb from "../components/AskTheWeb";

export default function Overview({ serverId }: { serverId: Id<"servers"> }) {
  const stats = useQuery(api.runs.stats, { serverId });
  const recent = useQuery(api.runs.list, { serverId, limit: 6 });
  const alerts = useQuery(api.alerts.list, { serverId, onlyOpen: true });
  const evalRuns = useQuery(api.evals.runs, { serverId });

  if (!stats) return <Skeleton />;

  const latest = evalRuns?.[0];
  const previous = evalRuns?.[1];

  return (
    <div className="px-8 py-7">
      <h1 className="text-[19px] font-semibold tracking-tight">Overview</h1>
      <p className="mt-0.5 text-[13px] text-muted">
        Everything the crew did, and what it cost.
      </p>

      <AskTheWeb />

      <div className="mt-6 grid grid-cols-4 gap-3">
        <Stat
          label="Task success"
          value={pct(stats.successRate)}
          sub={`${stats.totalRuns} runs · ${stats.escalated} escalated`}
          tone={stats.successRate >= 0.85 ? "good" : stats.successRate >= 0.7 ? "warn" : "bad"}
        />
        <Stat
          label="Median latency"
          value={duration(stats.p50DurationMs)}
          sub={`p95 ${duration(stats.p95DurationMs)}`}
        />
        <Stat
          label="Cost per task"
          value={usd(stats.avgCostUsd)}
          sub={`${usd(stats.totalCostUsd)} total`}
        />
        <Stat
          label="Eval score"
          value={latest ? `${latest.passed}/${latest.total}` : "—"}
          sub={
            latest && previous
              ? `${previous.passed}/${previous.total} on ${previous.label.split("—")[0].trim()}`
              : "no baseline yet"
          }
          tone={latest && latest.passed === latest.total ? "good" : undefined}
        />
      </div>

      {!!alerts?.length && (
        <div className="mt-6 rounded-xl border border-bad/25 bg-bad/[0.04]">
          <div className="flex items-center justify-between border-b border-bad/15 px-4 py-2.5">
            <span className="text-[13px] font-medium text-bad">
              {alerts.length} open alert{alerts.length > 1 ? "s" : ""}
            </span>
            <Link to="/app/alerts" className="text-[12px] text-muted hover:text-fg">
              View all →
            </Link>
          </div>
          {alerts.slice(0, 3).map((a) => (
            <Link
              key={a._id}
              to={a.runId ? `/app/runs/${a.runId}` : "/app/alerts"}
              className="flex items-center gap-3 border-b border-line-soft px-4 py-2.5 last:border-0 hover:bg-raised/40"
            >
              <span
                className={`rounded px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide ${
                  a.kind === "cost_spike"
                    ? "bg-warn/15 text-warn"
                    : "bg-bad/15 text-bad"
                }`}
              >
                {a.kind.replace("_", " ")}
              </span>
              <span className="flex-1 truncate text-[13px] text-muted">{a.message}</span>
              <span className="tnum shrink-0 text-[11px] text-faint">{ago(a.createdAt)}</span>
            </Link>
          ))}
        </div>
      )}

      <div className="mt-6 grid grid-cols-3 gap-5">
        <section className="col-span-2">
          <div className="mb-2.5 flex items-center justify-between">
            <h2 className="text-[13px] font-medium text-muted">Recent runs</h2>
            <Link to="/app/runs" className="text-[12px] text-faint hover:text-fg">
              All runs →
            </Link>
          </div>
          <div className="overflow-hidden rounded-xl border border-line bg-panel">
            {recent?.map((r) => {
              const s = STATUS_STYLE[r.status];
              return (
                <Link
                  key={r._id}
                  to={`/app/runs/${r.runId}`}
                  className="flex items-center gap-3 border-b border-line-soft px-4 py-3 last:border-0 hover:bg-raised/50"
                >
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${s.dot}`} />
                  <span className="flex-1 truncate text-[13px]">{r.input}</span>
                  <span className="tnum shrink-0 text-[11px] text-faint">
                    {duration(r.durationMs)}
                  </span>
                  <span className="tnum w-14 shrink-0 text-right text-[11px] text-muted">
                    {usd(r.totalCostUsd)}
                  </span>
                </Link>
              );
            })}
          </div>
        </section>

        <section>
          <h2 className="mb-2.5 text-[13px] font-medium text-muted">Spend by agent</h2>
          <div className="rounded-xl border border-line bg-panel p-4">
            {stats.spendByAgent.map((a) => {
              const max = stats.spendByAgent[0].costUsd || 1;
              return (
                <div key={a.agentKey} className="mb-3 last:mb-0">
                  <div className="mb-1 flex items-baseline justify-between">
                    <span className="text-[12px] text-fg">{a.agentKey}</span>
                    <span className="tnum text-[11px] text-muted">{usd(a.costUsd)}</span>
                  </div>
                  <div className="h-1 overflow-hidden rounded-full bg-line-soft">
                    <div
                      className="h-full rounded-full bg-blurple"
                      style={{ width: `${(a.costUsd / max) * 100}%` }}
                    />
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

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone?: "good" | "warn" | "bad";
}) {
  const toneClass =
    tone === "good"
      ? "text-good"
      : tone === "warn"
        ? "text-warn"
        : tone === "bad"
          ? "text-bad"
          : "text-fg";

  return (
    <div className="rounded-xl border border-line bg-panel px-4 py-3.5">
      <div className="text-[11px] font-medium uppercase tracking-wide text-faint">{label}</div>
      <div className={`tnum mt-1.5 text-[22px] font-semibold ${toneClass}`}>{value}</div>
      <div className="mt-0.5 text-[11px] text-faint">{sub}</div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="px-8 py-7">
      <div className="h-5 w-32 rounded bg-raised" />
      <div className="mt-6 grid grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl border border-line bg-panel" />
        ))}
      </div>
    </div>
  );
}
