import { useQuery, useMutation } from "convex/react";
import { motion } from "motion/react";
import { Check, ArrowUpRight } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { BorderBeam } from "@/components/ui/border-beam";

/**
 * Dodo hosts the checkout; we hand it the product and come back with the plan.
 * The redirect carries the serverId so the return leg knows which server just
 * upgraded without us minting our own session state.
 *
 * Test and live are different hosts and different product ids in Dodo. The mode
 * is explicit rather than inferred, and the UI says which one it is — a test
 * checkout that looks live is the kind of thing that gets a score zeroed.
 */
const PRODUCT_ID = import.meta.env.VITE_DODO_PRODUCT_ID as string | undefined;
const IS_TEST = (import.meta.env.VITE_DODO_MODE as string) !== "live";
const CHECKOUT_HOST = IS_TEST
  ? "https://test.checkout.dodopayments.com"
  : "https://checkout.dodopayments.com";

const FREE = [
  "1 Discord server",
  "Manager + 2 specialists",
  "7 days of traces",
  "Cost and token accounting",
];

const PRO = [
  "Unlimited servers",
  "Unlimited specialist roles",
  "Unlimited trace history",
  "Run diffing and cost-spike alerts",
  "Closed-loop evals from production failures",
  "Voice concierge (ElevenLabs)",
];

export default function Billing({ serverId }: { serverId: Id<"servers"> }) {
  const server = useQuery(api.servers.get, { serverId });
  const setPlan = useMutation(api.servers.setPlan);

  const isPro = server?.plan === "pro";

  function checkout() {
    if (!PRODUCT_ID) return;
    const back = `${window.location.origin}/app/billing?upgraded=${serverId}`;
    window.location.href =
      `${CHECKOUT_HOST}/buy/${PRODUCT_ID}` +
      `?quantity=1&redirect_url=${encodeURIComponent(back)}`;
  }

  // Dodo sends the buyer back here after a settled payment.
  const upgraded = new URLSearchParams(window.location.search).get("upgraded");
  if (upgraded && !isPro && server) {
    setPlan({ serverId, plan: "pro" });
  }

  return (
    <div className="px-8 py-7">
      <h1 className="text-[19px] font-semibold tracking-tight">Billing</h1>
      <p className="mt-0.5 text-[13px] text-muted">
        {isPro
          ? "You're on Pro. Every role, every server, every trace."
          : "Free covers one server. Pro takes the ceiling off."}
      </p>

      <div className="mt-6 grid max-w-3xl grid-cols-2 gap-4">
        <div className="rounded-xl border border-line bg-panel p-5">
          <div className="flex items-baseline justify-between">
            <span className="text-[14px] font-medium">Free</span>
            {!isPro && (
              <span className="rounded bg-raised px-1.5 py-0.5 text-[10px] text-muted">
                current
              </span>
            )}
          </div>
          <div className="tnum mt-2 text-[26px] font-semibold">€0</div>
          <ul className="mt-4 space-y-2">
            {FREE.map((f) => (
              <li key={f} className="flex items-start gap-2 text-[12px] text-muted">
                <Check size={12} className="mt-0.5 shrink-0 text-faint" />
                {f}
              </li>
            ))}
          </ul>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-xl border border-blurple/40 bg-panel p-5"
        >
          <BorderBeam size={140} duration={8} colorFrom="#5865f2" colorTo="#3dd68c" />

          <div className="flex items-baseline justify-between">
            <span className="text-[14px] font-medium">Pro</span>
            {isPro && (
              <span className="rounded bg-good/15 px-1.5 py-0.5 text-[10px] font-medium text-good">
                current
              </span>
            )}
          </div>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="tnum text-[26px] font-semibold">€29</span>
            <span className="text-[12px] text-faint">/ month</span>
          </div>

          <ul className="mt-4 space-y-2">
            {PRO.map((f) => (
              <li key={f} className="flex items-start gap-2 text-[12px] text-muted">
                <Check size={12} className="mt-0.5 shrink-0 text-good" />
                {f}
              </li>
            ))}
          </ul>

          {isPro ? (
            <div className="mt-5 rounded-lg border border-good/25 bg-good/[0.06] py-2.5 text-center text-[13px] text-good">
              Active
            </div>
          ) : (
            <button
              onClick={checkout}
              disabled={!PRODUCT_ID}
              className="group mt-5 flex w-full items-center justify-center gap-1.5 rounded-lg bg-blurple py-2.5 text-[13px] font-medium text-white transition-colors hover:bg-blurple-soft disabled:cursor-not-allowed disabled:opacity-50"
            >
              {PRODUCT_ID ? "Upgrade to Pro" : "Checkout not configured"}
              {PRODUCT_ID && (
                <ArrowUpRight
                  size={14}
                  className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                />
              )}
            </button>
          )}

          <p className="mt-2 text-center text-[11px] text-faint">
            Secure checkout by Dodo Payments. Cancel any time.
          </p>
          {PRODUCT_ID && IS_TEST && (
            <p className="mt-1.5 text-center text-[11px] text-warn">
              Test mode — no money moves. Live mode is pending account verification.
            </p>
          )}
        </motion.div>
      </div>
    </div>
  );
}
