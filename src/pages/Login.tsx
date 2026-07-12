import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useConvexAuth } from "convex/react";
import { motion, AnimatePresence } from "motion/react";
import { ArrowRight, Zap, MailCheck, KeyRound } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { DotPattern } from "@/components/ui/dot-pattern";
import { cn } from "@/lib/utils";
import { Logo } from "../App";

/**
 * Magic link is the front door: one field, no password, and an unknown address
 * gets an account on first click — so signing in and signing up are the same
 * act. Password stays available for the demo account and anyone who wants it.
 */
const DEMO = { email: "demo@miniva.co", password: "miniva-demo-2026" };

export default function Login() {
  const { isAuthenticated } = useConvexAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [usePassword, setUsePassword] = useState(false);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (isAuthenticated) return <Navigate to="/app" replace />;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");

    if (usePassword) {
      const res = await authClient.signIn.email({ email, password });
      if (res.error) {
        setError(res.error.message ?? "That didn't work.");
        setBusy(false);
      }
      return; // on success the provider flips and App routes onward
    }

    const res = await authClient.signIn.magicLink({
      email,
      callbackURL: `${window.location.origin}/app`,
    });
    if (res.error) {
      setError(res.error.message ?? "Could not send the link.");
      setBusy(false);
      return;
    }
    setSent(true);
    setBusy(false);
  }

  /** Sign in as the demo user, creating the account the first time. */
  async function demo() {
    setBusy(true);
    setError("");

    const signedIn = await authClient.signIn.email(DEMO);
    if (!signedIn.error) return;

    const created = await authClient.signUp.email({ ...DEMO, name: "Demo" });
    if (created.error) {
      setError(created.error.message ?? "Could not open the demo account.");
      setBusy(false);
    }
  }

  return (
    <div className="relative min-h-full bg-ink">
      <DotPattern
        className={cn(
          "opacity-40 [mask-image:radial-gradient(500px_circle_at_center_top,white,transparent)]",
        )}
      />

      <div className="relative z-10 mx-auto max-w-sm px-6 py-20">
        <Link to="/" className="mb-10 flex items-center gap-2">
          <Logo />
          <span className="text-[15px] font-semibold tracking-tight">Miniva</span>
        </Link>

        <AnimatePresence mode="wait">
          {sent ? (
            <motion.div
              key="sent"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-xl border border-good/30 bg-good/10 text-good">
                <MailCheck size={18} />
              </div>
              <h1 className="text-[24px] font-semibold tracking-tight">Check your inbox</h1>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
                We sent a sign-in link to <span className="text-fg">{email}</span>. It
                works once and expires in 5 minutes.
              </p>
              <button
                onClick={() => {
                  setSent(false);
                  setError("");
                }}
                className="mt-6 text-[12px] text-faint transition-colors hover:text-fg"
              >
                Use a different email
              </button>
            </motion.div>
          ) : (
            <motion.div
              key="form"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <h1 className="text-[24px] font-semibold tracking-tight">Sign in</h1>
              <p className="mt-1.5 text-[13px] text-muted">
                {usePassword
                  ? "With your password."
                  : "We'll email you a link. No password to remember."}
              </p>

              <button
                onClick={demo}
                disabled={busy}
                className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg border border-blurple/40 bg-blurple/10 py-2.5 text-[13px] font-medium text-blurple-soft transition-colors hover:bg-blurple/15 disabled:opacity-60"
              >
                <Zap size={14} />
                Open the demo account
              </button>

              <div className="my-5 flex items-center gap-3">
                <div className="h-px flex-1 bg-line" />
                <span className="text-[11px] text-faint">or</span>
                <div className="h-px flex-1 bg-line" />
              </div>

              <form onSubmit={submit} className="space-y-2.5">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="w-full rounded-lg border border-line bg-panel px-3.5 py-2.5 text-[13px] outline-none placeholder:text-faint focus:border-blurple/60"
                />

                {usePassword && (
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password"
                    className="w-full rounded-lg border border-line bg-panel px-3.5 py-2.5 text-[13px] outline-none placeholder:text-faint focus:border-blurple/60"
                  />
                )}

                {error && <p className="text-[12px] text-bad">{error}</p>}

                <button
                  type="submit"
                  disabled={busy}
                  className="group flex w-full items-center justify-center gap-1.5 rounded-lg bg-blurple py-2.5 text-[13px] font-medium text-white transition-colors hover:bg-blurple-soft disabled:opacity-60"
                >
                  {busy
                    ? "…"
                    : usePassword
                      ? "Sign in"
                      : "Email me a sign-in link"}
                  <ArrowRight
                    size={14}
                    className="transition-transform group-hover:translate-x-0.5"
                  />
                </button>
              </form>

              <button
                onClick={() => {
                  setUsePassword((p) => !p);
                  setError("");
                }}
                className="mt-4 flex w-full items-center justify-center gap-1.5 text-[12px] text-faint transition-colors hover:text-fg"
              >
                <KeyRound size={11} />
                {usePassword ? "Email me a link instead" : "Use a password instead"}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
