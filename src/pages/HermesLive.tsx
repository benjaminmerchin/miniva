import { ExternalLink } from "lucide-react";

/**
 * The actual Hermes instance behind the demo Discord, embedded live.
 *
 * Served through the worker's /hermes-live proxy: the instance speaks plain
 * http on port 8787, which most networks block and https pages can't frame.
 * The proxy puts it on https://miniva.co, port 443 — works from any device.
 */
const SESSION_PATH = "/hermes-live/session/fcc8b0f8507c";

export default function HermesLive() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-line px-8 py-4">
        <div>
          <h1 className="text-[16px] font-semibold tracking-tight">Hermes — live session</h1>
          <p className="mt-0.5 text-[12px] text-muted">
            The harness running the demo Discord's crew, in real time. This is the
            engine; the rest of Miniva is the cockpit.
          </p>
        </div>
        <a
          href={SESSION_PATH}
          target="_blank"
          rel="noreferrer"
          className="flex shrink-0 items-center gap-1.5 rounded-md border border-line bg-panel px-3 py-1.5 text-[12px] text-muted transition-colors hover:text-fg"
        >
          <ExternalLink size={12} />
          Open full screen
        </a>
      </div>

      <iframe
        src={SESSION_PATH}
        title="Hermes live session"
        className="w-full flex-1 border-0 bg-ink"
      />
    </div>
  );
}
