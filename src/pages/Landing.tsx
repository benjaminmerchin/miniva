import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation } from "convex/react";
import { motion } from "motion/react";
import { ArrowRight, Check, Activity, GitBranch, ShieldCheck, Gauge } from "lucide-react";
import { api } from "../../convex/_generated/api";
import { DotPattern } from "@/components/ui/dot-pattern";
import { BorderBeam } from "@/components/ui/border-beam";
import { Marquee } from "@/components/ui/marquee";
import { cn } from "@/lib/utils";
import AgentOrg from "../components/AgentOrg";
import { Logo } from "../App";

export default function Landing() {
  return (
    <div className="relative min-h-full overflow-hidden bg-ink">
      <DotPattern
        className={cn(
          "opacity-40 [mask-image:radial-gradient(720px_circle_at_center_top,white,transparent)]",
        )}
      />

      <Nav />
      <Hero />
      <Proof />
      <Features />
      <BuiltWith />
      <Footer />
    </div>
  );
}

function Nav() {
  return (
    <header className="relative z-20 mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
      <div className="flex items-center gap-2">
        <Logo />
        <span className="text-[15px] font-semibold tracking-tight">Miniva</span>
      </div>
      <Link
        to="/app"
        className="rounded-md border border-line bg-panel px-3.5 py-1.5 text-[13px] text-muted transition-colors hover:text-fg"
      >
        Open dashboard
      </Link>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative z-10 mx-auto max-w-6xl px-6 pb-16 pt-16">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="max-w-2xl"
      >
        <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-line bg-panel px-3 py-1 text-[12px] text-muted">
          <span className="live-dot h-1.5 w-1.5 rounded-full bg-good" />
          Runs on Hermes
        </div>

        <h1 className="text-[46px] font-semibold leading-[1.08] tracking-[-0.02em]">
          Your Discord already has
          <br />
          a support team.
          <br />
          <span className="text-muted">It's just made of people.</span>
        </h1>

        <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-muted">
          Miniva gives a Discord server an ops crew that actually works: a manager
          agent that plans and delegates, specialists that answer, refund, moderate
          and speak — and a trace of every decision they made, down to the token.
        </p>

        <div className="mt-7 flex items-center gap-3">
          <SignupForm />
        </div>

        <p className="mt-3 text-[12px] text-faint">
          Connect a server, define a role, watch it work. No code.
        </p>
      </motion.div>
    </section>
  );
}

function SignupForm() {
  const signup = useMutation(api.signups.create);
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (state === "sending" || state === "done") return;
    setState("sending");
    try {
      await signup({ email, source: "landing-hero" });
      setState("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setState("error");
    }
  }

  if (state === "done") {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-good/30 bg-good/[0.06] px-4 py-2.5 text-[13px] text-good">
        <Check size={15} />
        You're on the list. We'll mail you the moment your slot opens.
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex w-full max-w-md flex-col gap-1.5">
      <div className="flex gap-2">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (state === "error") setState("idle");
          }}
          placeholder="you@company.com"
          className="min-w-0 flex-1 rounded-lg border border-line bg-panel px-3.5 py-2.5 text-[13px] outline-none transition-colors placeholder:text-faint focus:border-blurple/60"
        />
        <button
          type="submit"
          disabled={state === "sending"}
          className="group flex shrink-0 items-center gap-1.5 rounded-lg bg-blurple px-4 py-2.5 text-[13px] font-medium text-white transition-colors hover:bg-blurple-soft disabled:opacity-60"
        >
          {state === "sending" ? "…" : "Get early access"}
          <ArrowRight
            size={14}
            className="transition-transform group-hover:translate-x-0.5"
          />
        </button>
      </div>
      {state === "error" && <span className="text-[12px] text-bad">{error}</span>}
    </form>
  );
}

/** The product, not a promise: the org diagram, live. */
function Proof() {
  return (
    <section className="relative z-10 mx-auto max-w-6xl px-6 pb-20">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.5 }}
        className="relative overflow-hidden rounded-2xl border border-line bg-panel/60 p-6 backdrop-blur"
      >
        <BorderBeam size={220} duration={9} colorFrom="#5865f2" colorTo="#3dd68c" />

        <div className="mb-1 flex items-baseline justify-between">
          <h2 className="text-[14px] font-medium">One message in. A crew handles it.</h2>
          <span className="tnum text-[11px] text-faint">avg 8.2s · $0.015 / task</span>
        </div>
        <p className="mb-2 max-w-lg text-[12px] leading-relaxed text-faint">
          The manager reads what came in, decides what it needs, and hands it to the
          right specialist. Nothing is hardcoded — it plans against the actual request.
        </p>

        <AgentOrg />
      </motion.div>
    </section>
  );
}

const FEATURES = [
  {
    icon: <GitBranch size={16} />,
    title: "Define a role in 10 minutes",
    body: "Name it, write the job, tick the tools, set the spend limit. Hermes picks it up on the next message. Nobody opens an editor.",
  },
  {
    icon: <Activity size={16} />,
    title: "Every decision, traced",
    body: "The full call tree — who delegated to whom, what each agent read, what it cost. Diff two runs side by side and see exactly where they diverged.",
  },
  {
    icon: <ShieldCheck size={16} />,
    title: "Guardrails, not vibes",
    body: "Spend caps, allowed channels, and the line where an agent must stop and hand it to a human — with the full context, not a restart.",
  },
  {
    icon: <Gauge size={16} />,
    title: "Failures become tests",
    body: "Every run that fails or escalates is captured as an eval case automatically. Your test set grows from production, not from memory.",
  },
];

function Features() {
  return (
    <section className="relative z-10 mx-auto max-w-6xl px-6 pb-20">
      <div className="grid grid-cols-2 gap-3.5">
        {FEATURES.map((f, i) => (
          <motion.div
            key={f.title}
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.4, delay: i * 0.07 }}
            className="rounded-xl border border-line bg-panel p-5 transition-colors hover:border-line/80"
          >
            <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-raised text-blurple-soft">
              {f.icon}
            </div>
            <h3 className="text-[14px] font-medium">{f.title}</h3>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{f.body}</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

/**
 * A signpost for what is actually wired in, not a logo wall. Each of these does
 * real work in a run you can open in the dashboard.
 */
const STACK = [
  { name: "Hermes", role: "agent harness" },
  { name: "OpenAI", role: "gpt-5.5" },
  { name: "Convex", role: "state + traces" },
  { name: "Cloudflare", role: "hosting" },
  { name: "Linkup", role: "web search tool" },
  { name: "ElevenLabs", role: "voice tool" },
  { name: "Dodo", role: "checkout" },
  { name: "Wispr Flow", role: "dictation" },
];

function BuiltWith() {
  return (
    <section className="relative z-10 border-y border-line-soft py-8">
      <p className="mb-5 text-center text-[11px] font-medium uppercase tracking-widest text-faint">
        Built with
      </p>
      <Marquee pauseOnHover className="[--duration:32s]">
        {STACK.map((s) => (
          <div
            key={s.name}
            className="mx-3 flex items-baseline gap-2 rounded-lg border border-line-soft bg-panel px-4 py-2"
          >
            <span className="text-[13px] font-medium">{s.name}</span>
            <span className="text-[11px] text-faint">{s.role}</span>
          </div>
        ))}
      </Marquee>
    </section>
  );
}

function Footer() {
  return (
    <footer className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-6 py-8">
      <span className="text-[12px] text-faint">Miniva — built on Hermes</span>
      <Link to="/setup" className="text-[12px] text-muted transition-colors hover:text-fg">
        Connect a server →
      </Link>
    </footer>
  );
}
