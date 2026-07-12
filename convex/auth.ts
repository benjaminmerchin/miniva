import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex, crossDomain } from "@convex-dev/better-auth/plugins";
import { betterAuth } from "better-auth/minimal";
import { magicLink } from "better-auth/plugins";
import { components } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { query } from "./_generated/server";
import authConfig from "./auth.config";
import { sendMagicLink } from "./email";

const siteUrl = process.env.SITE_URL!;

export const authComponent = createClient<DataModel>(components.betterAuth);

export const createAuth = (ctx: GenericCtx<DataModel>) =>
  betterAuth({
    baseURL: process.env.CONVEX_SITE_URL,
    // One Convex deployment serves both the local dev server and the live site.
    trustedOrigins: [siteUrl, "http://localhost:5173", "https://miniva.co"],
    database: authComponent.adapter(ctx),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
    },
    plugins: [
      // Signing in and signing up are the same act: an unknown address gets an
      // account on first click, so there is no "wrong door" to pick.
      magicLink({
        expiresIn: 60 * 5,
        disableSignUp: false,
        sendMagicLink: async ({ email, url }) => {
          await sendMagicLink(email, url);
        },
      }),
      crossDomain({ siteUrl }),
      convex({ authConfig }),
    ],
  });

export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => await authComponent.getAuthUser(ctx),
});
