import { forwardRef, useRef } from "react";
import { AnimatedBeam } from "@/components/ui/animated-beam";
import { MessageSquare, Search, Volume2, CreditCard, ShieldCheck, Brain } from "lucide-react";

/**
 * The org, drawn. A message lands, the manager plans, specialists execute.
 * This is the diagram the whole product is about, so it is not a screenshot —
 * it animates against the real crew shape.
 */
const Node = forwardRef<
  HTMLDivElement,
  { icon: React.ReactNode; label: string; sub?: string; accent?: boolean }
>(({ icon, label, sub, accent }, ref) => (
  <div
    ref={ref}
    className={`z-10 flex items-center gap-2.5 rounded-xl border px-3 py-2.5 backdrop-blur ${
      accent
        ? "border-blurple/40 bg-blurple/10 shadow-[0_0_24px_-6px] shadow-blurple/40"
        : "border-line bg-panel/90"
    }`}
  >
    <span className={accent ? "text-blurple-soft" : "text-muted"}>{icon}</span>
    <span className="min-w-0">
      <span className="block truncate text-[12px] font-medium leading-tight">{label}</span>
      {sub && <span className="block truncate text-[10px] text-faint">{sub}</span>}
    </span>
  </div>
));
Node.displayName = "Node";

export default function AgentOrg() {
  const container = useRef<HTMLDivElement>(null);
  const inbox = useRef<HTMLDivElement>(null);
  const manager = useRef<HTMLDivElement>(null);
  const docs = useRef<HTMLDivElement>(null);
  const billing = useRef<HTMLDivElement>(null);
  const mod = useRef<HTMLDivElement>(null);
  const voice = useRef<HTMLDivElement>(null);

  const specialists = [docs, billing, mod, voice];

  return (
    <div
      ref={container}
      className="relative flex h-[280px] w-full items-center justify-between px-2"
    >
      <div className="flex flex-col justify-center">
        <Node
          ref={inbox}
          icon={<MessageSquare size={15} />}
          label="#support"
          sub="a member asks"
        />
      </div>

      <div className="flex flex-col justify-center">
        <Node
          ref={manager}
          icon={<Brain size={15} />}
          label="Ops Manager"
          sub="plans · delegates · reviews"
          accent
        />
      </div>

      <div className="flex flex-col gap-2.5">
        <Node ref={docs} icon={<Search size={14} />} label="Docs Answers" sub="linkup.search" />
        <Node ref={billing} icon={<CreditCard size={14} />} label="Billing" sub="refund policy" />
        <Node ref={mod} icon={<ShieldCheck size={14} />} label="Moderation" sub="spam · scams" />
        <Node ref={voice} icon={<Volume2 size={14} />} label="Voice Concierge" sub="elevenlabs" />
      </div>

      <AnimatedBeam
        containerRef={container}
        fromRef={inbox}
        toRef={manager}
        curvature={0}
        gradientStartColor="#5865f2"
        gradientStopColor="#7983f5"
      />
      {specialists.map((s, i) => (
        <AnimatedBeam
          key={i}
          containerRef={container}
          fromRef={manager}
          toRef={s}
          curvature={(i - 1.5) * 22}
          delay={i * 0.35}
          gradientStartColor="#5865f2"
          gradientStopColor="#3dd68c"
        />
      ))}
    </div>
  );
}
