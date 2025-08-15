import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // === USER MANAGEMENT & BILLING (PRD Section 6) ===
  users: defineTable({
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    image: v.optional(v.string()),
    tokenIdentifier: v.string(),
    clerkId: v.optional(v.string()), // Optional for backward compatibility
  }).index("by_token", ["tokenIdentifier"])
    .index("by_clerk", ["clerkId"]),

  workspaces: defineTable({
    name: v.string(),
    plan: v.string(), // "free" | "pro" | "enterprise"
    ownerId: v.string(),
    createdAt: v.number(),
  }).index("by_owner", ["ownerId"]),

  memberships: defineTable({
    workspaceId: v.id("workspaces"),
    userId: v.string(),
    role: v.string(), // "viewer" | "editor" | "admin"
    createdAt: v.number(),
  }).index("by_workspace", ["workspaceId"])
    .index("by_user", ["userId"]),

  subscriptions: defineTable({
    userId: v.optional(v.string()),
    workspaceId: v.optional(v.id("workspaces")),
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
    .index("workspaceId", ["workspaceId"])
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

  jobs: defineTable({
    workspaceId: v.id("workspaces"),
    status: v.string(), // "CREATED" | "UPLOADED" | "CLASSIFIED" | "PARSED" | "EXTRACTED" | "NORMALIZED" | "BUILT" | "READY" | "FAILED" | "PARTIAL" | "CANCELLED"
    domainMode: v.string(), // "auto" | "forced"  
    domain: v.optional(v.string()), // "chip" | "api" | "saas" | "networking" | etc.
    profileVersion: v.optional(v.string()),
    createdAt: v.number(),
    metrics: v.optional(v.object({
      latencyMs: v.optional(v.number()),
      pagesTotal: v.optional(v.number()),
      ocrPages: v.optional(v.number()),
      costEstimate: v.optional(v.number()),
    })),
    error: v.optional(v.string()),
  }).index("by_workspace", ["workspaceId"])
    .index("by_status", ["status"]),

  documents: defineTable({
    jobId: v.id("jobs"),
    filename: v.string(),
    hash: v.string(),
    pages: v.optional(v.number()),
    storageUrl: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
    mime: v.optional(v.string()),
    qualityScore: v.optional(v.number()),
    createdAt: v.number(),
  }).index("by_job", ["jobId"])
    .index("by_hash", ["hash"]),

  artifacts: defineTable({
    documentId: v.id("documents"),
    page: v.number(),
    type: v.string(), // "text" | "table" | "ocr" | "layout"
    payload: v.any(),
    bboxMap: v.optional(v.any()),
    createdAt: v.number(),
  }).index("by_document", ["documentId"])
    .index("by_type", ["type"]),

  extractionsRaw: defineTable({
    documentId: v.id("documents"),
    fieldId: v.string(),
    fieldLabel: v.string(),
    valueRaw: v.string(),
    unitRaw: v.optional(v.string()),
    source: v.object({
      page: v.number(),
      bbox: v.optional(v.object({
        x: v.number(),
        y: v.number(),
        width: v.number(),
        height: v.number(),
      })),
      method: v.string(), // "text" | "table" | "ocr"
    }),
    confidence: v.number(),
    candidates: v.optional(v.array(v.any())),
    createdAt: v.number(),
  }).index("by_document", ["documentId"])
    .index("by_field", ["fieldId"]),

  extractionsNorm: defineTable({
    documentId: v.id("documents"),
    fieldId: v.string(),
    value: v.union(v.string(), v.number(), v.boolean(), v.null()),
    unit: v.optional(v.string()),
    note: v.optional(v.string()),
    flags: v.array(v.string()), // ["needs_review", "out_of_bounds", etc.]
    provenanceRef: v.string(),
    confidence: v.number(),
    createdAt: v.number(),
  }).index("by_document", ["documentId"])
    .index("by_field", ["fieldId"]),

  results: defineTable({
    jobId: v.id("jobs"),
    columns: v.array(v.object({
      id: v.string(),
      label: v.string(),
      unit: v.optional(v.string()),
      better: v.optional(v.string()), // "up" | "down" | "n/a"
    })),
    rows: v.array(v.object({
      documentId: v.id("documents"),
      cells: v.record(v.string(), v.object({
        value: v.union(v.string(), v.number(), v.boolean(), v.null()),
        unit: v.optional(v.string()),
        confidence: v.number(),
        provenanceRef: v.string(),
        flags: v.array(v.string()),
      })),
    })),
    highlights: v.optional(v.array(v.any())),
    exports: v.optional(v.object({
      csvUrl: v.optional(v.string()),
      xlsxUrl: v.optional(v.string()),
      jsonUrl: v.optional(v.string()),
    })),
    createdAt: v.number(),
  }).index("by_job", ["jobId"]),

  // === DOMAIN PROFILES & CLASSIFICATION ===
  profiles: defineTable({
    domain: v.string(),
    version: v.string(),
    schema: v.any(),
    synonyms: v.any(),
    units: v.any(),
    rules: v.object({
      ranges: v.optional(v.any()),
      priorities: v.optional(v.any()),
      bounds: v.optional(v.any()),
      canonicalMaps: v.optional(v.any()),
    }),
    createdAt: v.number(),
  }).index("by_domain", ["domain"])
    .index("by_version", ["version"]),

  domainClassifications: defineTable({
    documentId: v.id("documents"),
    domain: v.string(),
    confidence: v.number(),
    method: v.string(),
    alternativeDomains: v.array(v.object({
      domain: v.string(),
      confidence: v.number(),
    })),
    requiresConfirmation: v.boolean(),
    evidence: v.object({
      primaryMatches: v.array(v.string()),
      secondaryMatches: v.array(v.string()),
      sectionMatches: v.array(v.string()),
      negativeMatches: v.array(v.string()),
    }),
    createdAt: v.number(),
  }).index("by_document", ["documentId"])
    .index("by_domain", ["domain"]),

  // === SYNONYM MAPS & LEARNING ===
  synonymsGlobal: defineTable({
    token: v.string(),
    variants: v.array(v.string()),
    domainContext: v.optional(v.string()),
    score: v.number(),
    createdAt: v.number(),
  }).index("by_token", ["token"])
    .index("by_domain", ["domainContext"]),

  synonymsWorkspace: defineTable({
    workspaceId: v.id("workspaces"),
    token: v.string(),
    variants: v.array(v.string()),
    domainContext: v.optional(v.string()),
    source: v.string(), // "curated" | "auto"
    score: v.number(),
    createdAt: v.number(),
  }).index("by_workspace", ["workspaceId"])
    .index("by_token", ["token"]),

  // === USER OVERRIDES & AUDIT ===
  overrides: defineTable({
    resultId: v.id("results"),
    documentId: v.id("documents"),
    fieldId: v.string(),
    value: v.union(v.string(), v.number(), v.boolean(), v.null()),
    unit: v.optional(v.string()),
    userId: v.string(),
    createdAt: v.number(),
  }).index("by_result", ["resultId"])
    .index("by_document", ["documentId"])
    .index("by_user", ["userId"]),

  auditLogs: defineTable({
    workspaceId: v.id("workspaces"),
    actor: v.string(), // userId
    action: v.string(), // "create_job" | "override_value" | "export_data" | etc.
    target: v.string(), // resourceId being acted upon
    metadata: v.optional(v.any()),
    createdAt: v.number(),
  }).index("by_workspace", ["workspaceId"])
    .index("by_actor", ["actor"])
    .index("by_action", ["action"]),

  // === LEGACY COMPATIBILITY (for migration) ===
  comparisonJobs: defineTable({
    name: v.optional(v.string()),
    status: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
    progress: v.optional(v.object({
      total: v.number(),
      completed: v.number(),
      stage: v.string(),
    })),
    synonymMapVersion: v.optional(v.string()),
  }),

  extractionJobs: defineTable({
    jobId: v.id("comparisonJobs"),
    documentId: v.id("documents"),
    vendorName: v.optional(v.string()),
    status: v.string(),
    error: v.optional(v.string()),
    qualityScore: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_job", ["jobId"])
    .index("by_document", ["documentId"]),

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
    metrics: v.any(),
    createdAt: v.number(),
  }).index("by_document", ["documentId"]),

  comparisonArtifacts: defineTable({
    jobId: v.id("comparisonJobs"),
    type: v.string(),
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
      optimality: v.optional(v.string()),
    })),
    lastUpdated: v.number(),
  }).index("by_version", ["version"])
    .index("by_active", ["active"]),

  proposedSynonyms: defineTable({
    labelRaw: v.string(),
    context: v.optional(v.string()),
    suggestedMetricId: v.optional(v.string()),
    confidence: v.number(),
    vendorName: v.optional(v.string()),
    jobId: v.optional(v.id("comparisonJobs")),
    documentId: v.optional(v.id("documents")),
    status: v.string(),
    createdAt: v.number(),
  }).index("by_status", ["status"])
    .index("by_job", ["jobId"]),
});
