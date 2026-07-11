import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ConvexReactClient } from "convex/react";
import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";
import type { AuthClient } from "@convex-dev/better-auth/react";
import { authClient } from "@/lib/auth-client";
import App from "./App";
import "./index.css";

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string, {
  expectAuth: true,
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/*
      better-auth 1.6.23's plugin inference collapses useSession().data to `never`
      against @convex-dev/better-auth 0.12.5, so the structural check fails on a
      client that is in fact the right shape. Types only — the runtime contract holds.
    */}
    <ConvexBetterAuthProvider client={convex} authClient={authClient as unknown as AuthClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ConvexBetterAuthProvider>
  </StrictMode>,
);
