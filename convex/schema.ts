import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    image: v.optional(v.string()),
    tokenIdentifier: v.string(),
  }).index("by_token", ["tokenIdentifier"]),
  subscriptions: defineTable({
    userId: v.optional(v.string()),
    polarId: v.optional(v.string()),
    polarPriceId: v.optional(v.string()),
    currency: v.optional(v.string()),
    interval: v.optional(v.string()),
    status: v.optional(v.string()),
    currentPeriodStart: v.optional(v.number()),
    currentPeriodEnd: v.optional(v.number()),
    cancelAtPeriodEnd: v.optional(v.boolean()),
    amount: v.optional(v.number()),
    startedAt: v.optional(v.number()),
    endsAt: v.optional(v.number()),
    endedAt: v.optional(v.number()),
    canceledAt: v.optional(v.number()),
    customerCancellationReason: v.optional(v.string()),
    customerCancellationComment: v.optional(v.string()),
    metadata: v.optional(v.any()),
    customFieldData: v.optional(v.any()),
    customerId: v.optional(v.string()),
  })
    .index("userId", ["userId"])
    .index("polarId", ["polarId"]),
  webhookEvents: defineTable({
    type: v.string(),
    polarEventId: v.string(),
    createdAt: v.string(),
    modifiedAt: v.string(),
    data: v.any(),
  })
    .index("type", ["type"])
    .index("polarEventId", ["polarEventId"]),

  // Application-specific tables
  oauthStates: defineTable({
    state: v.string(),
    service: v.union(v.literal("google_ads"), v.literal("gmail")),
    userTokenIdentifier: v.string(),
    createdAt: v.number(),
    consumedAt: v.optional(v.number()),
  }).index("by_state", ["state"]),

  clients: defineTable({
    userTokenIdentifier: v.string(),
    name: v.string(),
    googleAdsCustomerId: v.optional(v.string()),
    preferences: v.optional(
      v.object({
        language: v.optional(v.string()),
        tone: v.optional(v.string()),
        signature: v.optional(v.string()),
      })
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userTokenIdentifier"]) // list clients by owner
    .index("by_ads_customer", ["googleAdsCustomerId"]),

  integrations: defineTable({
    userTokenIdentifier: v.string(),
    service: v.union(v.literal("google_ads"), v.literal("gmail")),
    // OAuth tokens
    accessToken: v.optional(v.string()),
    refreshToken: v.optional(v.string()),
    scope: v.optional(v.string()),
    expiryDate: v.optional(v.number()),
    // Google Ads specific
    loginCustomerId: v.optional(v.string()),
    // Metadata
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user_service", ["userTokenIdentifier", "service"]),

  reports: defineTable({
    userTokenIdentifier: v.string(),
    clientId: v.id("clients"),
    periodStart: v.number(),
    periodEnd: v.number(),
    status: v.union(v.literal("bozza"), v.literal("inviato"), v.literal("errore")),
    subject: v.string(),
    html: v.string(),
    text: v.string(),
    gmailDraftId: v.optional(v.string()),
    gmailMessageId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    meta: v.optional(v.any()),
  })
    .index("by_user", ["userTokenIdentifier"]) // list by user
    .index("by_client", ["clientId"]) // list by client
    .index("by_status", ["status"]),

  automations: defineTable({
    userTokenIdentifier: v.string(),
    // if null -> globale per tutti i clienti dell'utente
    clientId: v.optional(v.id("clients")),
    enabled: v.boolean(),
    // 0-6 (0 domenica) oppure string es. "monday"; usiamo 0-6
    dayOfWeek: v.number(),
    // "HH:MM" 24h
    timeOfDay: v.string(),
    lastRunAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_user", ["userTokenIdentifier"]),

  logs: defineTable({
    userTokenIdentifier: v.string(),
    context: v.union(v.literal("report"), v.literal("automation"), v.literal("oauth"), v.literal("gmail"), v.literal("google_ads")),
    level: v.union(v.literal("info"), v.literal("warn"), v.literal("error")),
    message: v.string(),
    meta: v.optional(v.any()),
    createdAt: v.number(),
  }).index("by_user", ["userTokenIdentifier"]),
});
