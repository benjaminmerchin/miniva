import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useMutation } from "convex/react";
import { motion } from "motion/react";
import { Check, ArrowRight } from "lucide-react";
import { api } from "../../convex/_generated/api";
import { DotPattern } from "@/components/ui/dot-pattern";
import { cn } from "@/lib/utils";
import { Logo } from "../App";

/**
 * Connect a server, get a crew. Two screens, because a third would be one too many.
 *
 * The Discord OAuth handshake (scope: identify guilds) lands the real guild list
 * here; until that's wired, the operator types the guild id from Discord's
 * "Copy Server ID".
 */
const TEMPLATES = [
  {
    id: "community",
    name: "Community ops",
    blurb: "Triage, answer from the docs, moderate spam, greet new members by voice.",
    roles: ["Ops Manager", "Docs Answers", "Moderation", "Voice Concierge"],
  },
  {
    id: "support",
    name: "Paid support",
    blurb: "Front-line support with a refund policy the agent is not allowed to break.",
    roles: ["Ops Manager", "Docs Answers", "Billing & Refunds"],
  },
  {
    id: "blank",
    name: "Start blank",
    blurb: "One manager, no specialists. You define every role yourself.",
    roles: ["Ops Manager"],
  },
];

export default function Setup() {
  const navigate = useNavigate();
  const connect = useMutation(api.servers.connect);
  const createAgent = useMutation(api.agents.create);

  const [step, setStep] = useState(1);
  const [guildId, setGuildId] = useState("");
  const [name, setName] = useState("");
  const [template, setTemplate] = useState("community");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function finish() {
    setError("");
    if (!guildId.trim() || !name.trim()) {
      setStep(1);
      return setError("We need the server's id and a name.");
    }

    setBusy(true);
    try {
      const serverId = await connect({
        guildId: guildId.trim(),
        name: name.trim(),
        ownerDiscordId: "benjamin",
      });

      await createAgent({
        serverId,
        name: "Ops Manager",
        role: "manager",
        job: "Read every incoming message. Decide what it actually needs, delegate to the right specialist, review their draft before it ships, and escalate to a human only when policy says you must.",
        tools: ["discord.reply", "discord.thread", "miniva.escalate"],
        guardrails: {
          maxCostUsd: 0.5,
          maxSteps: 25,
          requiresHumanApproval: false,
          allowedChannelIds: [],
        },
        model: "gpt-5.5",
      });

      navigate("/app");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not connect that server.");
      setBusy(false);
    }
  }

  return (
    <div className="relative min-h-full bg-ink">
      <DotPattern
        className={cn(
          "opacity-40 [mask-image:radial-gradient(600px_circle_at_center_top,white,transparent)]",
        )}
      />

      <div className="relative z-10 mx-auto max-w-lg px-6 py-14">
        <Link to="/" className="mb-10 flex items-center gap-2">
          <Logo />
          <span className="text-[15px] font-semibold tracking-tight">Miniva</span>
        </Link>

        <div className="mb-8 flex items-center gap-2">
          {[1, 2].map((n) => (
            <div key={n} className="flex flex-1 items-center gap-2">
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-medium ${
                  step > n
                    ? "bg-good text-ink"
                    : step === n
                      ? "bg-blurple text-white"
                      : "border border-line text-faint"
                }`}
              >
                {step > n ? <Check size={11} /> : n}
              </span>
              <div
                className={`h-px flex-1 ${step > n ? "bg-good/40" : "bg-line"}`}
              />
            </div>
          ))}
        </div>

        {step === 1 && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <h1 className="text-[24px] font-semibold tracking-tight">
              Which server?
            </h1>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
              In Discord: right-click your server → Copy Server ID. (Developer Mode has
              to be on, under Settings → Advanced.)
            </p>

            <div className="mt-6 space-y-3">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Server name — e.g. Rivet Community"
                className="w-full rounded-lg border border-line bg-panel px-3.5 py-2.5 text-[13px] outline-none placeholder:text-faint focus:border-blurple/60"
              />
              <input
                value={guildId}
                onChange={(e) => setGuildId(e.target.value)}
                placeholder="Server ID — 1187442997219930112"
                className="tnum w-full rounded-lg border border-line bg-panel px-3.5 py-2.5 text-[13px] outline-none placeholder:text-faint focus:border-blurple/60"
              />
            </div>

            {error && <p className="mt-3 text-[12px] text-bad">{error}</p>}

            <button
              onClick={() => {
                if (!guildId.trim() || !name.trim())
                  return setError("Both fields, please.");
                setError("");
                setStep(2);
              }}
              className="group mt-6 flex w-full items-center justify-center gap-1.5 rounded-lg bg-blurple py-2.5 text-[13px] font-medium text-white transition-colors hover:bg-blurple-soft"
            >
              Continue
              <ArrowRight
                size={14}
                className="transition-transform group-hover:translate-x-0.5"
              />
            </button>
          </motion.div>
        )}

        {step === 2 && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <h1 className="text-[24px] font-semibold tracking-tight">
              What should the crew do?
            </h1>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
              Pick a starting point. You can add, rename and rewrite every role
              afterwards — nothing here is locked in.
            </p>

            <div className="mt-6 space-y-2">
              {TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTemplate(t.id)}
                  className={`w-full rounded-xl border px-4 py-3.5 text-left transition-colors ${
                    template === t.id
                      ? "border-blurple bg-blurple/[0.07]"
                      : "border-line bg-panel hover:border-line"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[14px] font-medium">{t.name}</span>
                    {template === t.id && <Check size={14} className="text-blurple-soft" />}
                  </div>
                  <p className="mt-1 text-[12px] leading-relaxed text-muted">{t.blurb}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {t.roles.map((r) => (
                      <span
                        key={r}
                        className="rounded border border-line-soft px-1.5 py-0.5 text-[10px] text-faint"
                      >
                        {r}
                      </span>
                    ))}
                  </div>
                </button>
              ))}
            </div>

            {error && <p className="mt-3 text-[12px] text-bad">{error}</p>}

            <button
              onClick={finish}
              disabled={busy}
              className="mt-6 w-full rounded-lg bg-blurple py-2.5 text-[13px] font-medium text-white transition-colors hover:bg-blurple-soft disabled:opacity-60"
            >
              {busy ? "Provisioning Hermes…" : "Create the crew"}
            </button>
            <p className="mt-2.5 text-center text-[11px] text-faint">
              Miniva spins up a Hermes instance for this server and hands it the crew.
            </p>
          </motion.div>
        )}
      </div>
    </div>
  );
}
