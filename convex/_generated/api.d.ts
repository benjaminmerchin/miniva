/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as agents from "../agents.js";
import type * as alerts from "../alerts.js";
import type * as auth from "../auth.js";
import type * as evals from "../evals.js";
import type * as googleCalendar from "../googleCalendar.js";
import type * as http from "../http.js";
import type * as ingest from "../ingest.js";
import type * as invoices from "../invoices.js";
import type * as linkup from "../linkup.js";
import type * as runs from "../runs.js";
import type * as seed from "../seed.js";
import type * as servers from "../servers.js";
import type * as signups from "../signups.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  agents: typeof agents;
  alerts: typeof alerts;
  auth: typeof auth;
  evals: typeof evals;
  googleCalendar: typeof googleCalendar;
  http: typeof http;
  ingest: typeof ingest;
  invoices: typeof invoices;
  linkup: typeof linkup;
  runs: typeof runs;
  seed: typeof seed;
  servers: typeof servers;
  signups: typeof signups;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  betterAuth: import("@convex-dev/better-auth/_generated/component.js").ComponentApi<"betterAuth">;
};
