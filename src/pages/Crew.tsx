import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { motion, AnimatePresence } from "motion/react";
import { Plus, X, Brain, Wrench, ShieldCheck, History } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Id, Doc } from "../../convex/_generated/dataModel";
import { usd, ago } from "../lib/format";

/**
 * The management surface. The bar it is built against: a non-engineer, with no
 * walkthrough, creates a working role — job, tools, guardrails — in under ten
 * minutes. So: no jargon, no JSON, and every field says what it is for.
 */
export default function Crew({ serverId }: { serverId: Id<"servers"> }) {
  const agents = useQuery(api.agents.listForServer, { serverId });
  const [editing, setEditing] = useState<Doc<"agents"> | "new" | null>(null);

  const manager = agents?.find((a) => a.role === "manager");
  const specialists = agents?.filter((a) => a.role === "specialist") ?? [];
  const hiredKeys = new Set(agents?.map((a) => a.key) ?? []);

  return (
    <div className="px-8 py-7">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[19px] font-semibold tracking-tight">Crew</h1>
          <p className="mt-0.5 text-[13px] text-muted">
            The manager reads what comes in and decides who handles it. Specialists do
            the work.
          </p>
        </div>
        <button
          onClick={() => setEditing("new")}
          className="flex items-center gap-1.5 rounded-lg bg-blurple px-3.5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-blurple-soft"
        >
          <Plus size={14} />
          New role
        </button>
      </div>

      {manager && (
        <section className="mt-6">
          <h2 className="mb-2.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-faint">
            <Brain size={12} /> Manager
          </h2>
          <AgentCard agent={manager} onEdit={() => setEditing(manager)} accent />
        </section>
      )}

      <section className="mt-7">
        <h2 className="mb-2.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-faint">
          <Wrench size={12} /> Specialists · {specialists.length}
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {specialists.map((a) => (
            <AgentCard key={a._id} agent={a} onEdit={() => setEditing(a)} />
          ))}
        </div>
      </section>

      <Library serverId={serverId} hired={hiredKeys} />

      <AnimatePresence>
        {editing && (
          <RoleEditor
            serverId={serverId}
            agent={editing === "new" ? null : editing}
            onClose={() => setEditing(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Hiring, not configuring. Each card is a complete role — job, tools,
 * guardrails — so someone who has never written a prompt still ends up with an
 * agent that works. Everything stays editable after.
 */
function Library({
  serverId,
  hired,
}: {
  serverId: Id<"servers">;
  hired: Set<string>;
}) {
  const roles = useQuery(api.agents.library) ?? [];
  const hire = useMutation(api.agents.hire);
  const [busy, setBusy] = useState<string | null>(null);

  return (
    <section className="mt-9">
      <h2 className="mb-1 text-[13px] font-medium text-muted">Hire from the library</h2>
      <p className="mb-3 text-[12px] text-faint">
        A complete role in one click. Edit it afterwards like any other.
      </p>

      <div className="grid grid-cols-3 gap-3">
        {roles.map((r) => {
          const already = hired.has(r.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"));
          return (
            <div
              key={r.slug}
              className="flex flex-col rounded-xl border border-line bg-panel p-4"
            >
              <span className="text-[14px] font-medium">{r.name}</span>
              <p className="mt-1 flex-1 text-[12px] leading-relaxed text-muted">
                {r.blurb}
              </p>

              <div className="mt-3 flex flex-wrap gap-1">
                {r.tools.map((t) => (
                  <span
                    key={t}
                    className="rounded border border-line-soft px-1.5 py-0.5 text-[10px] text-faint"
                  >
                    {t}
                  </span>
                ))}
              </div>

              <button
                disabled={already || busy === r.slug}
                onClick={async () => {
                  setBusy(r.slug);
                  await hire({ serverId, slug: r.slug });
                  setBusy(null);
                }}
                className={`mt-3.5 rounded-lg py-2 text-[12px] font-medium transition-colors ${
                  already
                    ? "cursor-default border border-line-soft text-faint"
                    : "bg-blurple text-white hover:bg-blurple-soft disabled:opacity-60"
                }`}
              >
                {already ? "Hired" : busy === r.slug ? "Hiring…" : "Hire"}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function AgentCard({
  agent,
  onEdit,
  accent,
}: {
  agent: Doc<"agents">;
  onEdit: () => void;
  accent?: boolean;
}) {
  return (
    <button
      onClick={onEdit}
      className={`w-full rounded-xl border bg-panel p-4 text-left transition-colors hover:border-blurple/40 ${
        accent ? "border-blurple/30" : "border-line"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-[14px] font-medium">{agent.name}</span>
        <span className="flex items-center gap-2">
          {!agent.enabled && (
            <span className="rounded bg-raised px-1.5 py-0.5 text-[10px] text-faint">
              paused
            </span>
          )}
          <span className="tnum rounded bg-raised px-1.5 py-0.5 text-[10px] text-muted">
            v{agent.version}
          </span>
        </span>
      </div>

      <p className="mt-1.5 line-clamp-2 text-[12px] leading-relaxed text-muted">
        {agent.job}
      </p>

      <div className="mt-3 flex flex-wrap gap-1">
        {agent.tools.map((t) => (
          <span
            key={t}
            className="rounded border border-line-soft px-1.5 py-0.5 text-[10px] text-faint"
          >
            {t}
          </span>
        ))}
      </div>

      <div className="tnum mt-3 flex items-center gap-3 border-t border-line-soft pt-2.5 text-[10px] text-faint">
        <span>max {usd(agent.guardrails.maxCostUsd)}/task</span>
        <span>{agent.guardrails.maxSteps} steps</span>
        <span>edited {ago(agent.updatedAt)}</span>
      </div>
    </button>
  );
}

function RoleEditor({
  serverId,
  agent,
  onClose,
}: {
  serverId: Id<"servers">;
  agent: Doc<"agents"> | null;
  onClose: () => void;
}) {
  const catalog = useQuery(api.agents.toolCatalog) ?? [];
  const history = useQuery(
    api.agents.versionHistory,
    agent ? { agentId: agent._id } : "skip",
  );
  const create = useMutation(api.agents.create);
  const update = useMutation(api.agents.update);
  const remove = useMutation(api.agents.remove);
  const setEnabled = useMutation(api.agents.setEnabled);

  const [name, setName] = useState(agent?.name ?? "");
  const [role, setRole] = useState<"manager" | "specialist">(agent?.role ?? "specialist");
  const [job, setJob] = useState(agent?.job ?? "");
  const [tools, setTools] = useState<string[]>(agent?.tools ?? []);
  const [maxCostUsd, setMaxCostUsd] = useState(agent?.guardrails.maxCostUsd ?? 0.25);
  const [maxSteps, setMaxSteps] = useState(agent?.guardrails.maxSteps ?? 12);
  const [channels, setChannels] = useState(
    agent?.guardrails.allowedChannelIds.join(", ") ?? "",
  );
  const [escalateTo, setEscalateTo] = useState(
    agent?.guardrails.escalateToDiscordUserId ?? "",
  );
  const [showHistory, setShowHistory] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const toggleTool = (id: string) =>
    setTools((t) => (t.includes(id) ? t.filter((x) => x !== id) : [...t, id]));

  async function save() {
    setError("");
    if (!name.trim()) return setError("Give the role a name.");
    if (job.trim().length < 20)
      return setError("Describe the job in a sentence or two — the agent reads this.");
    if (!tools.length) return setError("Pick at least one thing it's allowed to do.");

    const guardrails = {
      maxCostUsd,
      maxSteps,
      requiresHumanApproval: false,
      allowedChannelIds: channels
        .split(",")
        .map((c) => c.trim().replace(/^#/, ""))
        .filter(Boolean),
      escalateToDiscordUserId: escalateTo.trim() || undefined,
    };

    setSaving(true);
    try {
      if (agent) {
        await update({ agentId: agent._id, job, tools, guardrails, model: agent.model });
      } else {
        await create({ serverId, name, role, job, tools, guardrails, model: "gpt-5.5" });
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
      setSaving(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 px-6 py-10 backdrop-blur-sm"
    >
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.99 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.99 }}
        transition={{ duration: 0.18 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl rounded-2xl border border-line bg-panel shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <div>
            <h2 className="text-[15px] font-semibold">
              {agent ? `Edit ${agent.name}` : "New role"}
            </h2>
            <p className="mt-0.5 text-[12px] text-faint">
              {agent
                ? `Saving bumps this role to v${agent.version + 1}. Hermes picks it up on the next message.`
                : "Hermes picks this up on the next message. No deploy."}
            </p>
          </div>
          <button onClick={onClose} className="text-faint transition-colors hover:text-fg">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-6 px-6 py-5">
          {!agent && (
            <>
              <Field
                label="What do you call it?"
                hint="This is just a label for you."
              >
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Refunds Specialist"
                  className="w-full rounded-lg border border-line bg-raised px-3 py-2.5 text-[13px] outline-none placeholder:text-faint focus:border-blurple/60"
                />
              </Field>

              <Field
                label="Is it the manager, or a specialist?"
                hint="The manager reads every message and decides who handles it. There is one."
              >
                <div className="flex gap-2">
                  {(["specialist", "manager"] as const).map((r) => (
                    <button
                      key={r}
                      onClick={() => setRole(r)}
                      className={`flex-1 rounded-lg border px-3 py-2.5 text-[13px] capitalize transition-colors ${
                        role === r
                          ? "border-blurple bg-blurple/10 text-fg"
                          : "border-line bg-raised text-muted hover:text-fg"
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </Field>
            </>
          )}

          <Field
            label="What is its job?"
            hint="Write it like you'd brief a new hire. The agent reads this, word for word."
          >
            <textarea
              value={job}
              onChange={(e) => setJob(e.target.value)}
              rows={4}
              placeholder="Handle refund requests. Check the subscription record before answering. Refunds under €20 within 14 days are automatic — anything bigger goes to a human."
              className="w-full resize-none rounded-lg border border-line bg-raised px-3 py-2.5 text-[13px] leading-relaxed outline-none placeholder:text-faint focus:border-blurple/60"
            />
          </Field>

          <Field
            label="What is it allowed to do?"
            hint="It can only use what you tick here. Nothing else."
          >
            <div className="grid grid-cols-2 gap-1.5">
              {catalog.map((t) => {
                const on = tools.includes(t.id);
                return (
                  <button
                    key={t.id}
                    onClick={() => toggleTool(t.id)}
                    className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-left transition-colors ${
                      on
                        ? "border-blurple/50 bg-blurple/10"
                        : "border-line bg-raised hover:border-line"
                    }`}
                  >
                    <span
                      className={`mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border ${
                        on ? "border-blurple bg-blurple" : "border-faint"
                      }`}
                    >
                      {on && (
                        <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                          <path
                            d="M1.5 4L3 5.5L6.5 2"
                            stroke="white"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                          />
                        </svg>
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[12px] font-medium leading-tight">
                        {t.label}
                      </span>
                      <span className="block text-[11px] leading-tight text-faint">
                        {t.blurb}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </Field>

          <Field
            label="Where must it stop?"
            hint="Guardrails. It cannot spend past the cap, and it hands over instead of guessing."
          >
            <div className="space-y-3.5 rounded-lg border border-line bg-raised px-4 py-3.5">
              <div className="flex items-center gap-3">
                <ShieldCheck size={13} className="shrink-0 text-warn" />
                <span className="flex-1 text-[12px]">Never spend more than</span>
                <input
                  type="range"
                  min={0.05}
                  max={2}
                  step={0.05}
                  value={maxCostUsd}
                  onChange={(e) => setMaxCostUsd(Number(e.target.value))}
                  className="w-32 accent-blurple"
                />
                <span className="tnum w-12 text-right text-[12px] text-fg">
                  {usd(maxCostUsd)}
                </span>
                <span className="text-[11px] text-faint">per task</span>
              </div>

              <div className="flex items-center gap-3">
                <ShieldCheck size={13} className="shrink-0 text-warn" />
                <span className="flex-1 text-[12px]">Give up after</span>
                <input
                  type="range"
                  min={3}
                  max={40}
                  step={1}
                  value={maxSteps}
                  onChange={(e) => setMaxSteps(Number(e.target.value))}
                  className="w-32 accent-blurple"
                />
                <span className="tnum w-12 text-right text-[12px] text-fg">{maxSteps}</span>
                <span className="text-[11px] text-faint">steps</span>
              </div>

              <div className="border-t border-line-soft pt-3">
                <label className="mb-1 block text-[11px] text-muted">
                  Only in these channels
                </label>
                <input
                  value={channels}
                  onChange={(e) => setChannels(e.target.value)}
                  placeholder="support, general"
                  className="w-full rounded-md border border-line bg-panel px-2.5 py-1.5 text-[12px] outline-none placeholder:text-faint focus:border-blurple/60"
                />
              </div>

              <div>
                <label className="mb-1 block text-[11px] text-muted">
                  When it's stuck, hand it to
                </label>
                <input
                  value={escalateTo}
                  onChange={(e) => setEscalateTo(e.target.value)}
                  placeholder="benjamin"
                  className="w-full rounded-md border border-line bg-panel px-2.5 py-1.5 text-[12px] outline-none placeholder:text-faint focus:border-blurple/60"
                />
              </div>
            </div>
          </Field>

          {agent && (
            <div>
              <button
                onClick={() => setShowHistory((s) => !s)}
                className="flex items-center gap-1.5 text-[12px] text-faint transition-colors hover:text-fg"
              >
                <History size={12} />
                {showHistory ? "Hide" : "Show"} version history ({history?.length ?? 0})
              </button>

              {showHistory && (
                <div className="mt-2 overflow-hidden rounded-lg border border-line-soft">
                  {history?.map((h) => (
                    <div
                      key={h._id}
                      className="flex items-start gap-3 border-b border-line-soft px-3 py-2 last:border-0"
                    >
                      <span className="tnum shrink-0 rounded bg-raised px-1.5 py-0.5 text-[10px] text-muted">
                        v{h.version}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[11px] text-faint">
                        {h.job}
                      </span>
                      <span className="shrink-0 text-[10px] text-faint">
                        {ago(h.createdAt)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {error && <p className="text-[12px] text-bad">{error}</p>}
        </div>

        <div className="flex items-center justify-between border-t border-line px-6 py-4">
          <div className="flex gap-2">
            {agent && (
              <>
                <button
                  onClick={() => setEnabled({ agentId: agent._id, enabled: !agent.enabled })}
                  className="rounded-md border border-line px-3 py-1.5 text-[12px] text-muted transition-colors hover:text-fg"
                >
                  {agent.enabled ? "Pause" : "Resume"}
                </button>
                <button
                  onClick={async () => {
                    await remove({ agentId: agent._id });
                    onClose();
                  }}
                  className="rounded-md border border-line px-3 py-1.5 text-[12px] text-bad/80 transition-colors hover:text-bad"
                >
                  Delete
                </button>
              </>
            )}
          </div>

          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded-md px-3 py-1.5 text-[13px] text-muted transition-colors hover:text-fg"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="rounded-md bg-blurple px-4 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-blurple-soft disabled:opacity-60"
            >
              {saving ? "Saving…" : agent ? "Save changes" : "Create role"}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-[13px] font-medium">{label}</label>
      <p className="mb-2 mt-0.5 text-[11px] leading-relaxed text-faint">{hint}</p>
      {children}
    </div>
  );
}
