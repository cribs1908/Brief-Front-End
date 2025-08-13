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

  // Rimosse tabelle legacy (oauthStates, clients, integrations, reports, automations, logs)

  // --- Pipeline core (vedi back-end.md) ---
  documents: defineTable({
    jobId: v.id("comparisonJobs"),
    vendorName: v.optional(v.string()),
    sourceUri: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
    ingestedAt: v.number(),
    docType: v.optional(v.string()),
    pages: v.optional(v.number()),
    ocrUsed: v.optional(v.boolean()),
  }).index("by_job", ["jobId"]),

  extractionJobs: defineTable({
    jobId: v.id("comparisonJobs"),
    documentId: v.id("documents"),
    vendorName: v.optional(v.string()),
    status: v.string(), // pending|extracting|normalized|failed
    error: v.optional(v.string()),
    qualityScore: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_job", ["jobId"])
    .index("by_document", ["documentId"]),

  comparisonJobs: defineTable({
    name: v.optional(v.string()),
    status: v.string(), // queued|extracting|normalizing|aggregating|ready|ready_partial|failed|failed_no_signal
    createdAt: v.number(),
    updatedAt: v.number(),
    progress: v.optional(v.object({
      total: v.number(),
      completed: v.number(),
      stage: v.string(),
    })),
    synonymMapVersion: v.optional(v.string()),
  }),

  rawExtractions: defineTable({
    documentId: v.id("documents"),
    tables: v.optional(v.any()),
    textBlocks: v.optional(v.any()),
    extractionQuality: v.optional(v.number()),
    pageRefs: v.optional(v.any()),
    createdAt: v.number(),
  }).index("by_document", ["documentId"]),

  normalizedMetrics: defineTable({
    documentId: v.id("documents"),
    metrics: v.any(), // Array<{metricId, metricLabel, value, unit, confidence, sourceRef, normalizationVersion}>
    createdAt: v.number(),
  }).index("by_document", ["documentId"]),

  comparisonArtifacts: defineTable({
    jobId: v.id("comparisonJobs"),
    type: v.string(), // comparisonDataset | rawExtraction | normalizedMetrics | log
    storageId: v.optional(v.id("_storage")),
    data: v.optional(v.any()),
    createdAt: v.number(),
  }).index("by_job", ["jobId"]),

  synonymMaps: defineTable({
    version: v.string(),
    active: v.boolean(),
    entries: v.array(v.object({
      canonicalMetricId: v.string(),
      metricLabel: v.string(),
      synonyms: v.array(v.string()),
      unitRules: v.optional(v.any()),
      priority: v.optional(v.number()),
      optimality: v.optional(v.string()), // max|min
    })),
    lastUpdated: v.number(),
  }).index("by_version", ["version"]).index("by_active", ["active"]),

  proposedSynonyms: defineTable({
    labelRaw: v.string(),
    context: v.optional(v.string()),
    suggestedMetricId: v.optional(v.string()),
    confidence: v.number(),
    vendorName: v.optional(v.string()),
    jobId: v.optional(v.id("comparisonJobs")),
    documentId: v.optional(v.id("documents")),
    status: v.string(), // proposed|approved|rejected
    createdAt: v.number(),
  }).index("by_status", ["status"]).index("by_job", ["jobId"]),
});
