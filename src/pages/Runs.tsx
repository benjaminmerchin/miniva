import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "convex/react";
import { Search } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { usd, duration, ago, STATUS_STYLE } from "../lib/format";

const STATUSES = ["all", "succeeded", "failed", "escalated", "running"];

export default function Runs({ serverId }: { serverId: Id<"servers"> }) {
  const [status, setStatus] = useState("all");
  const [agentKey, setAgentKey] = useState("all");
  const [search, setSearch] = useState("");

  const agents = useQuery(api.agents.listForServer, { serverId });
  const runs = useQuery(api.runs.list, { serverId, status, agentKey, search });

  return (
    <div className="px-8 py-7">
      <h1 className="text-[19px] font-semibold tracking-tight">Runs</h1>
      <p className="mt-0.5 text-[13px] text-muted">
        Every task the crew took, searchable across all of them.
      </p>

      <div className="mt-5 flex items-center gap-2">
        <div className="relative flex-1">
          <Search
            size={13}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search across runs — the trigger, the outcome, the error…"
            className="w-full rounded-lg border border-line bg-panel py-2 pl-8.5 pr-3 text-[13px] outline-none transition-colors placeholder:text-faint focus:border-blurple/60"
          />
        </div>

        <Segmented options={STATUSES} value={status} onChange={setStatus} />

        <select
          value={agentKey}
          onChange={(e) => setAgentKey(e.target.value)}
          className="rounded-lg border border-line bg-panel px-3 py-2 text-[12px] text-muted outline-none focus:border-blurple/60"
        >
          <option value="all">All agents</option>
          {agents?.map((a) => (
            <option key={a._id} value={a.key}>
              {a.name}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-line bg-panel">
        <div className="flex items-center gap-3 border-b border-line px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-faint">
          <span className="w-2" />
          <span className="flex-1">Task</span>
          <span className="w-24">Kind</span>
          <span className="w-16 text-right">Duration</span>
          <span className="w-16 text-right">Cost</span>
          <span className="w-16 text-right">When</span>
        </div>

        {runs?.length === 0 && (
          <div className="px-4 py-10 text-center text-[13px] text-faint">
            No run matches that.
          </div>
        )}

        {runs?.map((r) => {
          const s = STATUS_STYLE[r.status];
          return (
            <Link
              key={r._id}
              to={`/app/runs/${r.runId}`}
              className="flex items-center gap-3 border-b border-line-soft px-4 py-2.5 last:border-0 transition-colors hover:bg-raised/50"
            >
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${s.dot}`}
                title={s.label}
              />
              <span className="min-w-0 flex-1 truncate text-[13px]">{r.input}</span>
              <span className="w-24 shrink-0 truncate text-[11px] text-faint">
                {r.taskKind}
              </span>
              <span className="tnum w-16 shrink-0 text-right text-[11px] text-muted">
                {duration(r.durationMs)}
              </span>
              <span className="tnum w-16 shrink-0 text-right text-[11px] text-muted">
                {usd(r.totalCostUsd)}
              </span>
              <span className="tnum w-16 shrink-0 text-right text-[11px] text-faint">
                {ago(r.startedAt)}
              </span>
            </Link>
          );
        })}
      </div>

      {!!runs?.length && (
        <p className="mt-2.5 text-[11px] text-faint">
          {runs.length} run{runs.length > 1 ? "s" : ""}
        </p>
      )}
    </div>
  );
}

function Segmented({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex shrink-0 gap-0.5 rounded-lg border border-line bg-panel p-0.5">
      {options.map((o) => (
        <button
          key={o}
          onClick={() => onChange(o)}
          className={`rounded-md px-2.5 py-1.5 text-[12px] capitalize transition-colors ${
            value === o ? "bg-raised text-fg" : "text-faint hover:text-muted"
          }`}
        >
          {o}
        </button>
      ))}
    </div>
  );
}
