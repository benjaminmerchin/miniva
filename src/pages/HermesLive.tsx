import { ExternalLink, Activity } from "lucide-react";
import { motion } from "motion/react";
import { BorderBeam } from "@/components/ui/border-beam";

/**
 * The actual Hermes instance behind the demo Discord.
 *
 * It speaks plain http on a bare IP, which a https page can neither iframe
 * (mixed content) nor proxy through the worker (Cloudflare error 1003: no
 * direct-IP fetch). Top-level navigation has no such restriction — so this
 * page is a launchpad, not an embed. If a hermes.miniva.co DNS record lands,
 * the /hermes-live worker proxy can take over and this becomes an iframe.
 */
const SESSION_URL = "http://144.76.184.186:8787/session/fcc8b0f8507c";

export default function HermesLive() {
  return (
    <div className="flex h-full items-center justify-center px-8">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-line bg-panel p-7"
      >
        <BorderBeam size={160} duration={8} colorFrom="#5865f2" colorTo="#3dd68c" />

        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-raised text-blurple-soft">
            <Activity size={16} />
          </span>
          <div>
            <h1 className="text-[16px] font-semibold tracking-tight">
              Hermes — live session
            </h1>
            <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-faint">
              <span className="live-dot h-1.5 w-1.5 rounded-full bg-good" />
              hermes-fra-01 · running the demo Discord
            </div>
          </div>
        </div>

        <p className="mt-4 text-[13px] leading-relaxed text-muted">
          This is the engine itself: the Hermes harness executing the crew behind
          the demo Discord, streaming its session in real time. Miniva is the
          cockpit — agent definitions, traces, costs, evals. This is the machine
          they come from.
        </p>

        <a
          href={SESSION_URL}
          target="_blank"
          rel="noreferrer"
          className="group mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-blurple py-2.5 text-[13px] font-medium text-white transition-colors hover:bg-blurple-soft"
        >
          Open the live session
          <ExternalLink size={14} className="transition-transform group-hover:translate-x-0.5" />
        </a>

        <p className="mt-2.5 text-center text-[11px] text-faint">
          Opens in a new tab — the instance runs on the demo server.
        </p>
      </motion.div>
    </div>
  );
}
