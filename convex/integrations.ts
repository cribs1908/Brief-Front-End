import { action, httpAction, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { encryptString, decryptString } from "./utils/crypto";
import { api } from "./_generated/api";

// Helpers
function assertEnv(name: string): string {
  const val = (process.env as any)[name];
  if (!val) throw new Error(`${name} non configurata`);
  return val as string;
}

function buildGoogleOAuthUrl({
  clientId,
  redirectUri,
  scope,
  state,
  accessType = "offline",
  prompt = "consent",
}: {
  clientId: string;
  redirectUri: string;
  scope: string[];
  state: string;
  accessType?: "online" | "offline";
  prompt?: string;
}) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: scope.join(" "),
    state,
    access_type: accessType,
    prompt,
    include_granted_scopes: "true",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

async function exchangeCodeForTokens({
  code,
  redirectUri,
  clientId,
  clientSecret,
}: {
  code: string;
  redirectUri: string;
  clientId: string;
  clientSecret: string;
}) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed: ${text}`);
  }
  return (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope?: string;
    token_type: string;
  };
}

async function refreshAccessToken({
  refreshToken,
  clientId,
  clientSecret,
}: {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
}) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token refresh failed: ${text}`);
  }
  return (await res.json()) as {
    access_token: string;
    expires_in: number;
    scope?: string;
    token_type: string;
  };
}

export const getIntegrationStatus = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { googleAds: false, gmail: false };
    const google = await ctx.db
      .query("integrations")
      .withIndex("by_user_service", (q) =>
        q.eq("userTokenIdentifier", identity.subject).eq("service", "google_ads")
      )
      .first();
    const gmail = await ctx.db
      .query("integrations")
      .withIndex("by_user_service", (q) =>
        q.eq("userTokenIdentifier", identity.subject).eq("service", "gmail")
      )
      .first();
    return { googleAds: !!google, gmail: !!gmail };
  },
});

// Helpers to allow actions/httpActions to interact with DB via runQuery/runMutation
export const insertOauthState = mutation({
  args: {
    state: v.string(),
    service: v.union(v.literal("google_ads"), v.literal("gmail")),
    userTokenIdentifier: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("oauthStates", {
      state: args.state,
      service: args.service,
      userTokenIdentifier: args.userTokenIdentifier,
      createdAt: Date.now(),
    });
  },
});

export const getOauthStateByState = query({
  args: { state: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("oauthStates")
      .withIndex("by_state", (q) => q.eq("state", args.state))
      .unique();
  },
});

export const consumeOauthState = mutation({
  args: { id: v.id("oauthStates") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { consumedAt: Date.now() });
  },
});

export const getIntegrationByUserService = query({
  args: { userTokenIdentifier: v.string(), service: v.union(v.literal("google_ads"), v.literal("gmail")) },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("integrations")
      .withIndex("by_user_service", (q) =>
        q.eq("userTokenIdentifier", args.userTokenIdentifier).eq("service", args.service)
      )
      .first();
  },
});

export const upsertIntegration = mutation({
  args: {
    userTokenIdentifier: v.string(),
    service: v.union(v.literal("google_ads"), v.literal("gmail")),
    accessToken: v.optional(v.string()),
    refreshToken: v.optional(v.string()),
    scope: v.optional(v.string()),
    expiryDate: v.optional(v.number()),
    loginCustomerId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("integrations")
      .withIndex("by_user_service", (q) =>
        q.eq("userTokenIdentifier", args.userTokenIdentifier).eq("service", args.service)
      )
      .first();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        accessToken: args.accessToken ?? existing.accessToken,
        refreshToken: args.refreshToken ?? existing.refreshToken,
        scope: args.scope ?? existing.scope,
        expiryDate: args.expiryDate ?? existing.expiryDate,
        loginCustomerId: args.loginCustomerId ?? existing.loginCustomerId,
        updatedAt: now,
      });
      return existing._id;
    } else {
      return await ctx.db.insert("integrations", {
        userTokenIdentifier: args.userTokenIdentifier,
        service: args.service,
        accessToken: args.accessToken,
        refreshToken: args.refreshToken,
        scope: args.scope,
        expiryDate: args.expiryDate,
        loginCustomerId: args.loginCustomerId,
        createdAt: now,
        updatedAt: now,
      });
    }
  },
});

export const createGoogleAdsOAuthUrl = action({
  args: { loginCustomerId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Non autenticato");

    const state = crypto.getRandomValues(new Uint8Array(16))
      .reduce((acc, b) => acc + b.toString(16).padStart(2, "0"), "");
    await ctx.runMutation(api.integrations.insertOauthState, {
      state,
      service: "google_ads",
      userTokenIdentifier: identity.subject,
    });

    const redirectUri = assertEnv("GOOGLE_ADS_REDIRECT_URI");
    const clientId = assertEnv("GOOGLE_OAUTH_CLIENT_ID");

    const url = buildGoogleOAuthUrl({
      clientId,
      redirectUri,
      scope: ["https://www.googleapis.com/auth/adwords"],
      state,
    });

    // Optionally store loginCustomerId in integration row on first connect
    if (args.loginCustomerId) {
      const existing = await ctx.runQuery(api.integrations.getIntegrationByUserService, {
        userTokenIdentifier: identity.subject,
        service: "google_ads",
      });
      if (existing) {
        await ctx.runMutation(api.integrations.upsertIntegration, {
          userTokenIdentifier: identity.subject,
          service: "google_ads",
          loginCustomerId: args.loginCustomerId,
        });
      }
    }

    return { url };
  },
});

export const disconnectIntegration = mutation({
  args: { service: v.union(v.literal("google_ads"), v.literal("gmail")) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Non autenticato");
    const existing = await ctx.db
      .query("integrations")
      .withIndex("by_user_service", (q) =>
        q.eq("userTokenIdentifier", identity.subject).eq("service", args.service)
      )
      .first();
    if (existing) {
      await ctx.db.delete(existing._id);
    }
    return { ok: true };
  },
});

export const createGmailOAuthUrl = action({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Non autenticato");

    const state = crypto.getRandomValues(new Uint8Array(16))
      .reduce((acc, b) => acc + b.toString(16).padStart(2, "0"), "");
    await ctx.runMutation(api.integrations.insertOauthState, {
      state,
      service: "gmail",
      userTokenIdentifier: identity.subject,
    });

    const redirectUri = assertEnv("GMAIL_REDIRECT_URI");
    const clientId = assertEnv("GOOGLE_OAUTH_CLIENT_ID");
    const scope = [
      "https://www.googleapis.com/auth/gmail.compose",
      "https://www.googleapis.com/auth/gmail.modify",
      "https://www.googleapis.com/auth/gmail.readonly",
    ];
    const url = buildGoogleOAuthUrl({ clientId, redirectUri, scope, state });
    return { url };
  },
});

// HTTP callback handlers
export const googleOAuthCallback = httpAction(async (ctx, request) => {
  const url = new URL(request.url);
  const service = url.pathname.includes("gmail") ? "gmail" : "google_ads";
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return new Response("Missing code/state", { status: 400 });

  const stateRow = await ctx.runQuery(api.integrations.getOauthStateByState, { state });
  if (!stateRow || stateRow.service !== service) {
    return new Response("Invalid state", { status: 400 });
  }

  const clientId = assertEnv("GOOGLE_OAUTH_CLIENT_ID");
  const clientSecret = assertEnv("GOOGLE_OAUTH_CLIENT_SECRET");
  const redirectUri = service === "gmail" ? assertEnv("GMAIL_REDIRECT_URI") : assertEnv("GOOGLE_ADS_REDIRECT_URI");

  try {
    const tokens = await exchangeCodeForTokens({ code, redirectUri, clientId, clientSecret });
    const encryptedAccess = await encryptString(tokens.access_token);
    const encryptedRefresh = tokens.refresh_token ? await encryptString(tokens.refresh_token) : undefined;
    const expiresAt = Date.now() + tokens.expires_in * 1000 - 60_000; // 1 min safety

    await ctx.runMutation(api.integrations.upsertIntegration, {
      userTokenIdentifier: stateRow.userTokenIdentifier,
      service,
      accessToken: encryptedAccess,
      refreshToken: encryptedRefresh,
      scope: tokens.scope,
      expiryDate: expiresAt,
    });

    // Mark state consumed
    await ctx.runMutation(api.integrations.consumeOauthState, { id: stateRow._id });

    // Redirect to frontend success page
    const redirect = (process.env.FRONTEND_URL || "http://localhost:5173") + 
      "/dashboard/integrations?connected=" + service;
    return new Response(null, { status: 302, headers: { Location: redirect } });
  } catch (e: any) {
    console.error("OAuth callback error", e);
    const redirect = (process.env.FRONTEND_URL || "http://localhost:5173") + 
      "/dashboard/integrations?error=oauth";
    return new Response(null, { status: 302, headers: { Location: redirect } });
  }
});

export const ensureAccessToken = action({
  args: { service: v.union(v.literal("google_ads"), v.literal("gmail")) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Non autenticato");
    const row = await ctx.runQuery(api.integrations.getIntegrationByUserService, {
      userTokenIdentifier: identity.subject,
      service: args.service,
    });
    if (!row || !row.accessToken) throw new Error("Integrazione non configurata");
    const accessTokenPlain = await decryptString(row.accessToken);
    if (row.expiryDate && row.expiryDate > Date.now() + 30_000) {
      return { accessToken: accessTokenPlain };
    }
    if (!row.refreshToken) return { accessToken: accessTokenPlain };
    const clientId = assertEnv("GOOGLE_OAUTH_CLIENT_ID");
    const clientSecret = assertEnv("GOOGLE_OAUTH_CLIENT_SECRET");
    const refreshed = await refreshAccessToken({
      refreshToken: await decryptString(row.refreshToken),
      clientId,
      clientSecret,
    });
    const encryptedAccess = await encryptString(refreshed.access_token);
    await ctx.runMutation(api.integrations.upsertIntegration, {
      userTokenIdentifier: identity.subject,
      service: args.service,
      accessToken: encryptedAccess,
      expiryDate: Date.now() + refreshed.expires_in * 1000 - 60_000,
    });
    return { accessToken: refreshed.access_token };
  },
});


