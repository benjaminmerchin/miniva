import { Routes, Route, NavLink, Navigate, useLocation } from "react-router-dom";
import { useQuery, Authenticated, Unauthenticated, AuthLoading } from "convex/react";
import { LogOut } from "lucide-react";
import { api } from "../convex/_generated/api";
import { authClient } from "@/lib/auth-client";
import Login from "./pages/Login";
import Landing from "./pages/Landing";
import Overview from "./pages/Overview";
import Runs from "./pages/Runs";
import RunDetail from "./pages/RunDetail";
import Compare from "./pages/Compare";
import Crew from "./pages/Crew";
import Evals from "./pages/Evals";
import Alerts from "./pages/Alerts";
import Setup from "./pages/Setup";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/setup" element={<Guarded><Setup /></Guarded>} />
      <Route path="/app/*" element={<Guarded><Shell /></Guarded>} />
    </Routes>
  );
}

/** Everything behind the marketing pages needs an account. */
function Guarded({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AuthLoading>
        <Booting label="Signing you in…" />
      </AuthLoading>
      <Unauthenticated>
        <Navigate to="/login" replace />
      </Unauthenticated>
      <Authenticated>{children}</Authenticated>
    </>
  );
}

function Shell() {
  const server = useQuery(api.servers.first);
  const openAlerts = useQuery(
    api.alerts.openCount,
    server ? { serverId: server._id } : "skip",
  );

  if (server === undefined) return <Booting />;
  if (server === null) return <Navigate to="/setup" replace />;

  return (
    <div className="flex h-full bg-ink">
      <aside className="flex w-60 shrink-0 flex-col border-r border-line bg-panel">
        <div className="flex items-center gap-2 px-5 py-5">
          <Logo />
          <span className="text-[15px] font-semibold tracking-tight">Miniva</span>
        </div>

        <div className="mx-3 mb-5 rounded-lg border border-line bg-raised px-3 py-2.5">
          <div className="flex items-center gap-2">
            <span
              className={`live-dot h-1.5 w-1.5 shrink-0 rounded-full ${
                server.status === "live" ? "bg-good" : "bg-warn"
              }`}
            />
            <span className="truncate text-[13px] font-medium">{server.name}</span>
          </div>
          <div className="mt-1 text-[11px] text-faint">
            {server.status === "live"
              ? `Hermes · ${server.hermesInstanceId}`
              : server.status}
          </div>
        </div>

        <nav className="flex flex-col gap-0.5 px-3">
          <Nav to="/app" end label="Overview" />
          <Nav to="/app/runs" label="Runs" />
          <Nav to="/app/crew" label="Crew" />
          <Nav to="/app/evals" label="Evals" />
          <Nav to="/app/alerts" label="Alerts" badge={openAlerts} />
        </nav>

        <div className="mt-auto space-y-2 px-3 pb-4">
          <div className="rounded-lg border border-line-soft px-3 py-2.5">
            <div className="text-[11px] text-faint">Ingest key</div>
            <code className="mt-0.5 block truncate text-[11px] text-muted">
              {server.ingestKey}
            </code>
          </div>
          <button
            onClick={() => authClient.signOut()}
            className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-[12px] text-faint transition-colors hover:bg-raised/60 hover:text-fg"
          >
            <LogOut size={12} />
            Sign out
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <Routes>
          <Route index element={<Overview serverId={server._id} />} />
          <Route path="runs" element={<Runs serverId={server._id} />} />
          <Route path="runs/compare" element={<Compare serverId={server._id} />} />
          <Route path="runs/:runId" element={<RunDetail />} />
          <Route path="crew" element={<Crew serverId={server._id} />} />
          <Route path="evals" element={<Evals serverId={server._id} />} />
          <Route path="alerts" element={<Alerts serverId={server._id} />} />
        </Routes>
      </main>
    </div>
  );
}

function Nav({
  to,
  label,
  end,
  badge,
}: {
  to: string;
  label: string;
  end?: boolean;
  badge?: number;
}) {
  const { pathname } = useLocation();
  // NavLink's `end` is too strict for /app/runs/:id — keep the parent lit.
  const active = end ? pathname === to : pathname.startsWith(to);

  return (
    <NavLink
      to={to}
      className={`flex items-center justify-between rounded-md px-3 py-1.5 text-[13px] transition-colors ${
        active
          ? "bg-raised font-medium text-fg"
          : "text-muted hover:bg-raised/60 hover:text-fg"
      }`}
    >
      {label}
      {!!badge && (
        <span className="tnum rounded-full bg-bad/15 px-1.5 py-px text-[10px] font-semibold text-bad">
          {badge}
        </span>
      )}
    </NavLink>
  );
}

function Booting({ label = "Connecting to Convex…" }: { label?: string }) {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="flex items-center gap-2.5 text-[13px] text-faint">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blurple" />
        {label}
      </div>
    </div>
  );
}

export function Logo() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
      <rect width="20" height="20" rx="5" fill="#5865F2" />
      <path
        d="M5.5 14V6.6l2.6 3.1 2.6-3.1V14"
        stroke="#fff"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="14.2" cy="12.6" r="1.4" fill="#fff" />
    </svg>
  );
}
