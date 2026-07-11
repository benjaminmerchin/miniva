/**
 * Sits in front of the static assets. Three jobs:
 *
 * 1. Send www to the apex.
 * 2. Proxy /hermes-live/* to the demo Hermes instance. The instance speaks
 *    plain http, and a https page cannot iframe http content — so the worker
 *    terminates TLS and fetches upstream. Frame-blocking headers are dropped
 *    on the way back (upstream only sends them Report-Only anyway).
 * 3. Invoice photos, in R2 (ingress and egress are free there).
 *    POST /invoices/img   — Hermes uploads the raw image bytes; the bearer is
 *                           the same ingest key as /v1/*, validated by asking
 *                           Convex. Returns {photoKey, photoUrl}.
 *    GET  /invoices/img/* — serves the photo back. Read is unauthenticated but
 *                           keys are UUIDs, so a URL is its own capability.
 *
 * Everything else falls through to the built SPA.
 */
interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  INVOICES: {
    put: (
      key: string,
      value: ArrayBuffer,
      opts?: { httpMetadata?: { contentType?: string } },
    ) => Promise<unknown>;
    get: (
      key: string,
    ) => Promise<{
      body: ReadableStream;
      httpMetadata?: { contentType?: string };
    } | null>;
  };
}

// Same deployment the SPA talks to; the worker only uses it to check bearers.
const CONVEX_SITE = "https://friendly-lion-451.convex.site";

const IMAGE_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

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

    if (url.pathname === "/invoices/img" && request.method === "POST") {
      const auth = request.headers.get("Authorization") ?? "";
      const check = await fetch(`${CONVEX_SITE}/v1/config`, {
        headers: { Authorization: auth },
      });
      if (!check.ok) {
        return Response.json({ error: "bad ingest key" }, { status: 401 });
      }

      const contentType = request.headers.get("Content-Type") ?? "";
      const ext = IMAGE_EXT[contentType.split(";")[0].trim()];
      if (!ext) {
        return Response.json(
          { error: `unsupported Content-Type; send one of ${Object.keys(IMAGE_EXT).join(", ")}` },
          { status: 415 },
        );
      }

      const body = await request.arrayBuffer();
      if (body.byteLength === 0 || body.byteLength > 15 * 1024 * 1024) {
        return Response.json({ error: "image must be 1 byte – 15 MB" }, { status: 413 });
      }

      const photoKey = `inv/${crypto.randomUUID()}.${ext}`;
      await env.INVOICES.put(photoKey, body, {
        httpMetadata: { contentType: contentType.split(";")[0].trim() },
      });
      return Response.json({
        photoKey,
        photoUrl: `https://miniva.co/invoices/img/${photoKey}`,
      });
    }

    if (url.pathname.startsWith("/invoices/img/") && request.method === "GET") {
      const key = decodeURIComponent(url.pathname.slice("/invoices/img/".length));
      const object = await env.INVOICES.get(key);
      if (!object) return new Response("not found", { status: 404 });
      return new Response(object.body, {
        headers: {
          "Content-Type": object.httpMetadata?.contentType ?? "application/octet-stream",
          // Keys are content-addressed-ish (UUID per upload), safe to cache hard.
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      });
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
