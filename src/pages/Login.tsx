import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useConvexAuth } from "convex/react";
import { motion } from "motion/react";
import { ArrowRight, Zap } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { DotPattern } from "@/components/ui/dot-pattern";
import { cn } from "@/lib/utils";
import { Logo } from "../App";

/**
 * Email + password for now. Magic link over Resend is a swap of the plugin in
 * convex/auth.ts, not a rewrite of this screen.
 *
 * The demo button exists so a mentor or a volunteer can be inside the product in
 * one click, without us dictating a password across a noisy room.
 */
const DEMO = { email: "demo@miniva.co", password: "miniva-demo-2026" };

export default function Login() {
  // The bug this fixes: sign-in succeeded, the session was live, and the page
  // just sat there. Watching auth state routes both fresh sign-ins and
  // already-signed-in visitors straight to the app. No email is ever sent.
  const { isAuthenticated } = useConvexAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");

    const res =
      mode === "signin"
        ? await authClient.signIn.email({ email, password })
        : await authClient.signUp.email({ email, password, name: email.split("@")[0] });

    if (res.error) {
      setError(res.error.message ?? "That didn't work.");
      setBusy(false);
    }
    // On success the provider flips to authenticated and App routes us onward.
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

  if (isAuthenticated) return <Navigate to="/app" replace />;

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

        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-[24px] font-semibold tracking-tight">
            {mode === "signin" ? "Sign in" : "Create an account"}
          </h1>
          <p className="mt-1.5 text-[13px] text-muted">
            {mode === "signin"
              ? "Pick up where your crew left off."
              : "One account, every server you run."}
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
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password — 8 characters or more"
              className="w-full rounded-lg border border-line bg-panel px-3.5 py-2.5 text-[13px] outline-none placeholder:text-faint focus:border-blurple/60"
            />

            {error && <p className="text-[12px] text-bad">{error}</p>}

            <button
              type="submit"
              disabled={busy}
              className="group flex w-full items-center justify-center gap-1.5 rounded-lg bg-blurple py-2.5 text-[13px] font-medium text-white transition-colors hover:bg-blurple-soft disabled:opacity-60"
            >
              {busy ? "…" : mode === "signin" ? "Sign in" : "Create account"}
              <ArrowRight
                size={14}
                className="transition-transform group-hover:translate-x-0.5"
              />
            </button>
          </form>

          <button
            onClick={() => {
              setMode((m) => (m === "signin" ? "signup" : "signin"));
              setError("");
            }}
            className="mt-4 w-full text-center text-[12px] text-faint transition-colors hover:text-fg"
          >
            {mode === "signin"
              ? "No account yet? Create one."
              : "Already have an account? Sign in."}
          </button>
        </motion.div>
      </div>
    </div>
  );
}
