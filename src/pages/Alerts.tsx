import { useQuery, useMutation } from "convex/react";
import { Link } from "react-router-dom";
import { AlertTriangle, TrendingUp, ShieldAlert, Check } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { ago, usd } from "../lib/format";

const KIND = {
  failure: { icon: AlertTriangle, color: "text-bad", bg: "bg-bad/10", label: "Failure" },
  cost_spike: { icon: TrendingUp, color: "text-warn", bg: "bg-warn/10", label: "Cost spike" },
  guardrail_breach: {
    icon: ShieldAlert,
    color: "text-warn",
    bg: "bg-warn/10",
    label: "Guardrail breach",
  },
} as const;

export default function Alerts({ serverId }: { serverId: Id<"servers"> }) {
  const alerts = useQuery(api.alerts.list, { serverId });
  const acknowledge = useMutation(api.alerts.acknowledge);

  const open = alerts?.filter((a) => !a.acknowledged) ?? [];
  const closed = alerts?.filter((a) => a.acknowledged) ?? [];

  return (
    <div className="px-8 py-7">
      <h1 className="text-[19px] font-semibold tracking-tight">Alerts</h1>
      <p className="mt-0.5 text-[13px] text-muted">
        Runs that failed, escalated, or cost far more than this server's baseline.
      </p>

      {alerts?.length === 0 && (
        <div className="mt-6 rounded-xl border border-line bg-panel px-4 py-12 text-center">
          <p className="text-[13px] text-faint">Nothing has gone wrong yet.</p>
        </div>
      )}

      {!!open.length && (
        <section className="mt-6">
          <h2 className="mb-2.5 text-[13px] font-medium text-muted">
            Open · {open.length}
          </h2>
          <div className="space-y-2">
            {open.map((a) => {
              const k = KIND[a.kind];
              const Icon = k.icon;
              return (
                <div
                  key={a._id}
                  className="flex items-start gap-3 rounded-xl border border-line bg-panel px-4 py-3"
                >
                  <span
                    className={`mt-px flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${k.bg} ${k.color}`}
                  >
                    <Icon size={13} />
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`text-[12px] font-medium ${k.color}`}>{k.label}</span>
                      <span className="text-[11px] text-faint">{ago(a.createdAt)}</span>
                    </div>
                    <p className="mt-0.5 text-[13px] leading-relaxed text-fg">{a.message}</p>

                    {a.observed != null && a.baseline != null && (
                      <p className="tnum mt-1 text-[11px] text-faint">
                        observed {usd(a.observed)} · baseline {usd(a.baseline)}
                      </p>
                    )}

                    {a.runId && (
                      <Link
                        to={`/app/runs/${a.runId}`}
                        className="mt-1.5 inline-block text-[12px] text-blurple-soft hover:underline"
                      >
                        Open the trace →
                      </Link>
                    )}
                  </div>

                  <button
                    onClick={() => acknowledge({ alertId: a._id })}
                    className="flex shrink-0 items-center gap-1 rounded-md border border-line px-2.5 py-1 text-[11px] text-muted transition-colors hover:text-fg"
                  >
                    <Check size={11} />
                    Ack
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {!!closed.length && (
        <section className="mt-7">
          <h2 className="mb-2.5 text-[13px] font-medium text-faint">
            Acknowledged · {closed.length}
          </h2>
          <div className="overflow-hidden rounded-xl border border-line-soft">
            {closed.map((a) => (
              <div
                key={a._id}
                className="flex items-center gap-3 border-b border-line-soft px-4 py-2.5 last:border-0"
              >
                <span className="text-[11px] uppercase tracking-wide text-faint">
                  {KIND[a.kind].label}
                </span>
                <span className="min-w-0 flex-1 truncate text-[12px] text-faint">
                  {a.message}
                </span>
                <span className="shrink-0 text-[11px] text-faint">{ago(a.createdAt)}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
