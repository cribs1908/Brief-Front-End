import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const listClients = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const rows = await ctx.db
      .query("clients")
      .withIndex("by_user", (q) => q.eq("userTokenIdentifier", identity.subject))
      .collect();
    return rows;
  },
});

export const createClient = mutation({
  args: {
    name: v.string(),
    googleAdsCustomerId: v.optional(v.string()),
    preferences: v.optional(
      v.object({
        language: v.optional(v.string()),
        tone: v.optional(v.string()),
        signature: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Non autenticato");
    const now = Date.now();
    const id = await ctx.db.insert("clients", {
      userTokenIdentifier: identity.subject,
      name: args.name,
      googleAdsCustomerId: args.googleAdsCustomerId,
      preferences: args.preferences,
      createdAt: now,
      updatedAt: now,
    });
    return await ctx.db.get(id);
  },
});

export const ensureTestClient = mutation({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Non autenticato");
    const existing = await ctx.db
      .query("clients")
      .withIndex("by_user", (q) => q.eq("userTokenIdentifier", identity.subject))
      .collect();
    const found = existing.find((c: any) => c.name === "Cliente di test" && c.googleAdsCustomerId === "TEST");
    if (found) return found;
    const now = Date.now();
    const id = await ctx.db.insert("clients", {
      userTokenIdentifier: identity.subject,
      name: "Cliente di test",
      googleAdsCustomerId: "TEST",
      preferences: {
        language: "it",
        tone: "amichevole",
        signature: "Team Agenzia\nFirma standard",
        email: "info@gmail.com",
      },
      createdAt: now,
      updatedAt: now,
    } as any);
    return await ctx.db.get(id);
  },
});

export const updateClient = mutation({
  args: {
    clientId: v.id("clients"),
    name: v.optional(v.string()),
    googleAdsCustomerId: v.optional(v.string()),
    preferences: v.optional(
      v.object({
        language: v.optional(v.string()),
        tone: v.optional(v.string()),
        signature: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Non autenticato");
    const client = await ctx.db.get(args.clientId);
    if (!client || client.userTokenIdentifier !== identity.subject) {
      throw new Error("Cliente non trovato");
    }
    await ctx.db.patch(args.clientId, {
      name: args.name ?? client.name,
      googleAdsCustomerId: args.googleAdsCustomerId ?? client.googleAdsCustomerId,
      preferences: args.preferences ?? client.preferences,
      updatedAt: Date.now(),
    });
    return await ctx.db.get(args.clientId);
  },
});


