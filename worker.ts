/**
 * Sits in front of the static assets. Two jobs:
 *
 * 1. Send www to the apex.
 * 2. Proxy /hermes-live/* to the demo Hermes instance. The instance speaks
 *    plain http, and a https page cannot iframe http content — so the worker
 *    terminates TLS and fetches upstream. Frame-blocking headers are dropped
 *    on the way back (upstream only sends them Report-Only anyway).
 *
 * Everything else falls through to the built SPA.
 */
interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

// A hostname, not the raw IP: Workers refuse direct-IP fetches (error 1003).
// The record is hermes.miniva.co -> 144.76.184.186, DNS-only.
const HERMES_UPSTREAM = "http://hermes.miniva.co:8787";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.hostname.startsWith("www.")) {
      url.hostname = url.hostname.slice(4);
      return Response.redirect(url.toString(), 301);
    }

    if (url.pathname.startsWith("/hermes-live/")) {
      const upstreamPath = url.pathname.slice("/hermes-live".length);
      const upstream = new Request(
        `${HERMES_UPSTREAM}${upstreamPath}${url.search}`,
        request,
      );

      // A 101 upgrade can't be reconstructed — hand websockets back untouched.
      if (request.headers.get("Upgrade")?.toLowerCase() === "websocket") {
        return fetch(upstream);
      }

      const res = await fetch(upstream);

      const headers = new Headers(res.headers);
      headers.delete("X-Frame-Options");
      headers.delete("Content-Security-Policy");
      headers.delete("Content-Security-Policy-Report-Only");

      return new Response(res.body, {
        status: res.status,
        statusText: res.statusText,
        headers,
      });
    }

    return env.ASSETS.fetch(request);
  },
};
