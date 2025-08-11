import { action, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";

export const upsertGlobalAutomation = mutation({
  args: {
    enabled: v.boolean(),
    dayOfWeek: v.number(),
    timeOfDay: v.string(), // HH:MM
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Non autenticato");
    const existing = await ctx.db
      .query("automations")
      .withIndex("by_user", (q) => q.eq("userTokenIdentifier", identity.subject))
      .collect();
    const global = existing.find((a) => !a.clientId);
    const now = Date.now();
    if (global) {
      await ctx.db.patch(global._id, {
        enabled: args.enabled,
        dayOfWeek: args.dayOfWeek,
        timeOfDay: args.timeOfDay,
        updatedAt: now,
      });
      return await ctx.db.get(global._id);
    } else {
      const id = await ctx.db.insert("automations", {
        userTokenIdentifier: identity.subject,
        clientId: undefined,
        enabled: args.enabled,
        dayOfWeek: args.dayOfWeek,
        timeOfDay: args.timeOfDay,
        createdAt: now,
        updatedAt: now,
      });
      return await ctx.db.get(id);
    }
  },
});

export const upsertClientAutomation = mutation({
  args: {
    clientId: v.id("clients"),
    enabled: v.boolean(),
    dayOfWeek: v.number(),
    timeOfDay: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Non autenticato");
    const now = Date.now();
    const existing = await ctx.db
      .query("automations")
      .withIndex("by_user", (q) => q.eq("userTokenIdentifier", identity.subject))
      .collect();
    const row = existing.find((a) => a.clientId === args.clientId);
    if (row) {
      await ctx.db.patch(row._id, {
        enabled: args.enabled,
        dayOfWeek: args.dayOfWeek,
        timeOfDay: args.timeOfDay,
        updatedAt: now,
      });
      return await ctx.db.get(row._id);
    } else {
      const id = await ctx.db.insert("automations", {
        userTokenIdentifier: identity.subject,
        clientId: args.clientId,
        enabled: args.enabled,
        dayOfWeek: args.dayOfWeek,
        timeOfDay: args.timeOfDay,
        createdAt: now,
        updatedAt: now,
      });
      return await ctx.db.get(id);
    }
  },
});

export const listAutomations = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    return ctx.db
      .query("automations")
      .withIndex("by_user", (q) => q.eq("userTokenIdentifier", identity.subject))
      .collect();
  },
});

// Cron executor. Finds due automations and triggers report generation.
export const runDueAutomations = action({
  handler: async (ctx) => {
    const automations = await ctx.runQuery(api.automations.listAutomations);
    const now = new Date();
    const day = now.getUTCDay();
    const minutes = now.getUTCHours() * 60 + now.getUTCMinutes();
    const isDue = (row: any) => {
      if (!row.enabled) return false;
      if (row.dayOfWeek !== day) return false;
      const [h, m] = row.timeOfDay.split(":").map((x: string) => parseInt(x, 10));
      const target = h * 60 + m;
      // Run if within last 15 minutes window and not already run in last hour
      const inWindow = Math.abs(minutes - target) <= 15;
      const notRecently = !row.lastRunAt || Date.now() - row.lastRunAt > 45 * 60 * 1000;
      return inWindow && notRecently;
    };

    for (const a of automations) {
      if (!isDue(a)) continue;
      // Determine clients to run
      const identitySubject = a.userTokenIdentifier;
      const clients = a.clientId
        ? [await ctx.runQuery(api.clients.listClients).then((cs) => cs.find((cl: any) => cl._id === a.clientId) || null)]
        : await ctx.runQuery(api.clients.listClients).then((cs) => cs.filter((c: any) => c.userTokenIdentifier === identitySubject));
      const end = Date.now();
      const start = end - 7 * 24 * 60 * 60 * 1000;
      for (const c of clients) {
        if (!c) continue;
        try {
          // Run as system; generate reports action requires auth, so we might need an internal variant.
          await ctx.runAction(api.reports.generateReport, {
            clientId: c._id,
            periodStart: start,
            periodEnd: end,
            language: c.preferences?.language || "it",
            tone: c.preferences?.tone || "amichevole",
            signature: c.preferences?.signature || "",
          });
        } catch (e) {
          console.error("Automation generateReport failed", e);
        }
      }
      await ctx.runMutation(api.automations.updateLastRun, { id: a._id });
    }
  },
});

export const updateLastRun = mutation({
  args: { id: v.id("automations") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { lastRunAt: Date.now(), updatedAt: Date.now() });
  },
});


