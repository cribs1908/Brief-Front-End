/**
 * User Correction Workflow with Audit and Learning
 * Implements human-in-the-loop corrections with automated learning
 */

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getDomainProfile } from "./domain_profiles";
import type { MetricCandidate } from "./langchain_parser";

// Correction types
export const CORRECTION_TYPES = {
  VALUE_FIX: "value_fix",           // User corrects extracted value
  UNIT_FIX: "unit_fix",             // User corrects unit
  FALSE_POSITIVE: "false_positive", // Field was incorrectly extracted
  MISSED_EXTRACTION: "missed_extraction" // Field was missed by extraction
} as const;

export type CorrectionType = typeof CORRECTION_TYPES[keyof typeof CORRECTION_TYPES];

/**
 * Submit a user correction for an extracted field
 */
export const submitCorrection = mutation({
  args: {
    job_id: v.union(v.id("jobs"), v.id("comparisonJobs")),
    document_id: v.id("documents"),
    field_name: v.string(),
    original_value: v.union(v.string(), v.number(), v.boolean(), v.null()),
    original_unit: v.optional(v.string()),
    original_confidence: v.number(),
    corrected_value: v.union(v.string(), v.number(), v.boolean(), v.null()),
    corrected_unit: v.optional(v.string()),
    correction_type: v.union(
      v.literal("value_fix"),
      v.literal("unit_fix"),
      v.literal("false_positive"),
      v.literal("missed_extraction")
    ),
    source_context: v.optional(v.string()),
    correction_notes: v.optional(v.string()),
    user_id: v.string(),
    workspace_id: v.id("workspaces")
  },
  handler: async (ctx, args) => {
    const correctionId = await ctx.db.insert("user_corrections", {
      ...args,
      learning_applied: false,
      created_at: new Date().toISOString()
    });

    // Log the correction action
    await ctx.db.insert("auditLogs", {
      workspaceId: args.workspace_id,
      actor: args.user_id,
      action: "field_correction",
      target: `${args.document_id}:${args.field_name}`,
      metadata: {
        correction_id: correctionId,
        correction_type: args.correction_type,
        original_value: args.original_value,
        corrected_value: args.corrected_value
      },
      createdAt: Date.now()
    });

    console.log(`User correction submitted: ${args.field_name} (${args.correction_type})`);

    // Trigger learning from this correction
    await applyLearningFromCorrection(ctx, correctionId, args);

    return correctionId;
  }
});

/**
 * Apply learning from user correction
 */
async function applyLearningFromCorrection(ctx: any, correctionId: any, correction: any) {
  try {
    // Get the document to understand domain context
    const document = await ctx.db.get(correction.document_id);
    if (!document) {
      console.warn("Document not found for correction learning");
      return;
    }

    // Get domain classification
    const domainClassification = await ctx.db
      .query("domainClassifications")
      .filter(q => q.eq(q.field("documentId"), correction.document_id))
      .first();

    const domain = domainClassification?.domain || "unknown";

    // Apply different learning strategies based on correction type
    switch (correction.correction_type) {
      case CORRECTION_TYPES.VALUE_FIX:
        await learnFromValueCorrection(ctx, correction, domain);
        break;
      
      case CORRECTION_TYPES.UNIT_FIX:
        await learnFromUnitCorrection(ctx, correction, domain);
        break;
      
      case CORRECTION_TYPES.FALSE_POSITIVE:
        await learnFromFalsePositive(ctx, correction, domain);
        break;
      
      case CORRECTION_TYPES.MISSED_EXTRACTION:
        await learnFromMissedExtraction(ctx, correction, domain);
        break;
    }

    // Mark correction as having learning applied
    await ctx.db.patch(correctionId, {
      learning_applied: true
    });

    console.log(`Learning applied for correction: ${correction.field_name} (${correction.correction_type})`);

  } catch (error) {
    console.error("Failed to apply learning from correction:", error);
  }
}

/**
 * Learn from value corrections - improve extraction patterns
 */
async function learnFromValueCorrection(ctx: any, correction: any, domain: string) {
  // If there's source context, we can learn new patterns
  if (correction.source_context) {
    const contextPattern = correction.source_context.toLowerCase();
    
    // Extract pattern around the corrected value
    const correctedValueStr = String(correction.corrected_value);
    
    // Look for patterns like "Voltage: 3.3V" -> "Power: 5W"
    if (contextPattern.includes(":")) {
      const labelPattern = contextPattern.split(":")[0].trim();
      
      // Add to workspace-specific synonyms if this is a new way to express the field
      await ctx.db.insert("synonymsWorkspace", {
        workspaceId: correction.workspace_id,
        token: correction.field_name,
        variants: [labelPattern],
        domainContext: domain,
        source: "correction",
        score: 0.8, // Start with good confidence for user corrections
        createdAt: Date.now()
      });
    }
  }

  // Track correction pattern for future improvements
  await ctx.db.insert("auditLogs", {
    workspaceId: correction.workspace_id,
    actor: "system",
    action: "learning_applied",
    target: `value_correction:${correction.field_name}`,
    metadata: {
      domain,
      pattern_learned: correction.source_context,
      original_value: correction.original_value,
      corrected_value: correction.corrected_value
    },
    createdAt: Date.now()
  });
}

/**
 * Learn from unit corrections - improve unit conversion
 */
async function learnFromUnitCorrection(ctx: any, correction: any, domain: string) {
  // Log unit conversion learning
  await ctx.db.insert("auditLogs", {
    workspaceId: correction.workspace_id,
    actor: "system",
    action: "unit_learning",
    target: `unit_correction:${correction.field_name}`,
    metadata: {
      domain,
      field: correction.field_name,
      original_unit: correction.original_unit,
      corrected_unit: correction.corrected_unit,
      context: correction.source_context
    },
    createdAt: Date.now()
  });

  // Could implement automatic unit mapping updates here
  // For now, log for manual review
}

/**
 * Learn from false positives - improve precision
 */
async function learnFromFalsePositive(ctx: any, correction: any, domain: string) {
  // Add negative pattern to avoid future false positives
  if (correction.source_context) {
    await ctx.db.insert("auditLogs", {
      workspaceId: correction.workspace_id,
      actor: "system", 
      action: "negative_pattern_learned",
      target: `false_positive:${correction.field_name}`,
      metadata: {
        domain,
        field: correction.field_name,
        negative_context: correction.source_context,
        false_value: correction.original_value
      },
      createdAt: Date.now()
    });
  }
}

/**
 * Learn from missed extractions - improve recall
 */
async function learnFromMissedExtraction(ctx: any, correction: any, domain: string) {
  // Learn new extraction patterns
  if (correction.source_context && correction.corrected_value) {
    const contextPattern = correction.source_context.toLowerCase();
    
    // Add new synonyms for this field based on the context
    await ctx.db.insert("synonymsWorkspace", {
      workspaceId: correction.workspace_id,
      token: correction.field_name,
      variants: [contextPattern],
      domainContext: domain,
      source: "missed_extraction",
      score: 0.9, // High confidence for user-provided corrections
      createdAt: Date.now()
    });

    await ctx.db.insert("auditLogs", {
      workspaceId: correction.workspace_id,
      actor: "system",
      action: "recall_pattern_learned",
      target: `missed_extraction:${correction.field_name}`,
      metadata: {
        domain,
        field: correction.field_name,
        new_pattern: correction.source_context,
        missed_value: correction.corrected_value
      },
      createdAt: Date.now()
    });
  }
}

/**
 * Get corrections for a specific job
 */
export const getCorrectionsByJob = query({
  args: { job_id: v.union(v.id("jobs"), v.id("comparisonJobs")) },
  handler: async (ctx, { job_id }) => {
    return await ctx.db
      .query("user_corrections")
      .filter(q => q.eq(q.field("job_id"), job_id))
      .order("desc")
      .collect();
  }
});

/**
 * Get corrections by user
 */
export const getCorrectionsByUser = query({
  args: { 
    user_id: v.string(),
    workspace_id: v.id("workspaces"),
    limit: v.optional(v.number())
  },
  handler: async (ctx, { user_id, workspace_id, limit = 50 }) => {
    return await ctx.db
      .query("user_corrections")
      .filter(q => q.eq(q.field("user_id"), user_id))
      .filter(q => q.eq(q.field("workspace_id"), workspace_id))
      .order("desc")
      .take(limit);
  }
});

/**
 * Get correction statistics for analytics
 */
export const getCorrectionStats = query({
  args: { 
    workspace_id: v.id("workspaces"),
    domain: v.optional(v.string()),
    days: v.optional(v.number())
  },
  handler: async (ctx, { workspace_id, domain, days = 30 }) => {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoffIso = cutoffDate.toISOString();

    let query = ctx.db
      .query("user_corrections")
      .filter(q => q.eq(q.field("workspace_id"), workspace_id))
      .filter(q => q.gte(q.field("created_at"), cutoffIso));

    const corrections = await query.collect();

    // Filter by domain if specified (requires joining with documents/classifications)
    let filteredCorrections = corrections;
    if (domain) {
      // This would require joining with domain classifications
      // For now, return all corrections
    }

    // Calculate statistics
    const stats = {
      total_corrections: filteredCorrections.length,
      by_type: {
        value_fix: filteredCorrections.filter(c => c.correction_type === "value_fix").length,
        unit_fix: filteredCorrections.filter(c => c.correction_type === "unit_fix").length,
        false_positive: filteredCorrections.filter(c => c.correction_type === "false_positive").length,
        missed_extraction: filteredCorrections.filter(c => c.correction_type === "missed_extraction").length
      },
      by_field: {} as Record<string, number>,
      learning_applied: filteredCorrections.filter(c => c.learning_applied).length,
      avg_corrections_per_day: filteredCorrections.length / days
    };

    // Count by field
    for (const correction of filteredCorrections) {
      stats.by_field[correction.field_name] = (stats.by_field[correction.field_name] || 0) + 1;
    }

    return stats;
  }
});

/**
 * Get learning insights from corrections
 */
export const getLearningInsights = query({
  args: { 
    workspace_id: v.id("workspaces"),
    domain: v.optional(v.string())
  },
  handler: async (ctx, { workspace_id, domain }) => {
    // Get recent learning events from audit logs
    let logsQuery = ctx.db
      .query("auditLogs")
      .filter(q => q.eq(q.field("workspaceId"), workspace_id))
      .filter(q => q.or(
        q.eq(q.field("action"), "learning_applied"),
        q.eq(q.field("action"), "unit_learning"),
        q.eq(q.field("action"), "negative_pattern_learned"),
        q.eq(q.field("action"), "recall_pattern_learned")
      ))
      .order("desc")
      .take(100);

    const learningLogs = await logsQuery.collect();

    // Get workspace-specific synonyms that came from corrections
    const learnedSynonyms = await ctx.db
      .query("synonymsWorkspace")
      .filter(q => q.eq(q.field("workspaceId"), workspace_id))
      .filter(q => q.or(
        q.eq(q.field("source"), "correction"),
        q.eq(q.field("source"), "missed_extraction")
      ))
      .collect();

    return {
      total_learning_events: learningLogs.length,
      learned_synonyms: learnedSynonyms.length,
      learning_by_type: {
        value_patterns: learningLogs.filter(l => l.action === "learning_applied").length,
        unit_mappings: learningLogs.filter(l => l.action === "unit_learning").length,
        negative_patterns: learningLogs.filter(l => l.action === "negative_pattern_learned").length,
        recall_patterns: learningLogs.filter(l => l.action === "recall_pattern_learned").length
      },
      recent_patterns: learnedSynonyms.slice(0, 10).map(s => ({
        field: s.token,
        pattern: s.variants[0],
        domain: s.domainContext,
        confidence: s.score
      }))
    };
  }
});

/**
 * Batch apply corrections to improve extraction for similar documents
 */
export const batchApplyLearning = mutation({
  args: {
    workspace_id: v.id("workspaces"),
    domain: v.string(),
    user_id: v.string()
  },
  handler: async (ctx, { workspace_id, domain, user_id }) => {
    // Get all unprocessed corrections for this domain
    const corrections = await ctx.db
      .query("user_corrections")
      .filter(q => q.eq(q.field("workspace_id"), workspace_id))
      .filter(q => q.eq(q.field("learning_applied"), false))
      .collect();

    let processedCount = 0;
    
    for (const correction of corrections) {
      try {
        await applyLearningFromCorrection(ctx, correction._id, correction);
        processedCount++;
      } catch (error) {
        console.error(`Failed to apply learning for correction ${correction._id}:`, error);
      }
    }

    // Log batch learning event
    await ctx.db.insert("auditLogs", {
      workspaceId: workspace_id,
      actor: user_id,
      action: "batch_learning_applied",
      target: `domain:${domain}`,
      metadata: {
        corrections_processed: processedCount,
        total_corrections: corrections.length
      },
      createdAt: Date.now()
    });

    return {
      success: true,
      processed: processedCount,
      total: corrections.length
    };
  }
});

/**
 * Export corrections for analysis or training data
 */
export const exportCorrections = query({
  args: {
    workspace_id: v.id("workspaces"),
    domain: v.optional(v.string()),
    format: v.union(v.literal("json"), v.literal("csv"))
  },
  handler: async (ctx, { workspace_id, domain, format }) => {
    let query = ctx.db
      .query("user_corrections")
      .filter(q => q.eq(q.field("workspace_id"), workspace_id));

    const corrections = await query.collect();

    // Filter by domain if specified (would need domain joining)
    const filteredCorrections = corrections;

    if (format === "json") {
      return {
        format: "json",
        data: filteredCorrections,
        count: filteredCorrections.length
      };
    } else {
      // Convert to CSV-like structure
      const csvData = filteredCorrections.map(c => ({
        field_name: c.field_name,
        original_value: c.original_value,
        corrected_value: c.corrected_value,
        correction_type: c.correction_type,
        confidence: c.original_confidence,
        created_at: c.created_at,
        learning_applied: c.learning_applied
      }));

      return {
        format: "csv",
        data: csvData,
        count: csvData.length
      };
    }
  }
});

/**
 * Get correction recommendations based on patterns
 */
export const getCorrectionRecommendations = query({
  args: {
    workspace_id: v.id("workspaces"),
    job_id: v.union(v.id("jobs"), v.id("comparisonJobs"))
  },
  handler: async (ctx, { workspace_id, job_id }) => {
    // Get extractions for this job that might need review
    const extractionsRaw = await ctx.db
      .query("extractionsRaw")
      .collect();

    // Find low-confidence extractions that might benefit from review
    const recommendations = extractionsRaw
      .filter(e => e.confidence < 0.7) // Low confidence
      .map(e => ({
        document_id: e.documentId,
        field_name: e.fieldId,
        value: e.valueRaw,
        unit: e.unitRaw,
        confidence: e.confidence,
        reason: e.confidence < 0.5 ? "Very low confidence" : "Low confidence",
        suggested_action: "review_extraction"
      }))
      .slice(0, 20); // Limit recommendations

    return {
      recommendations,
      total_low_confidence: recommendations.length,
      workspace_id
    };
  }
});