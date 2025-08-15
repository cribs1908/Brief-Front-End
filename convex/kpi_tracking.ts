/**
 * KPI Tracking and Profile/Synonym Versioning for Reproducibility
 * Implements comprehensive analytics and version management
 */

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { DOMAIN_PROFILES } from "./domain_profiles";
import type { MetricCandidate } from "./langchain_parser";

/**
 * Record KPIs for a completed extraction job
 */
export const recordExtractionKPIs = mutation({
  args: {
    job_id: v.union(v.id("jobs"), v.id("comparisonJobs")),
    domain: v.string(),
    profile_version: v.string(),
    synonym_map_version: v.string(),
    
    // Performance metrics
    total_documents: v.number(),
    total_pages: v.number(),
    extraction_time_ms: v.number(),
    ocr_time_ms: v.optional(v.number()),
    llm_time_ms: v.optional(v.number()),
    
    // Quality metrics
    extracted_metrics: v.array(v.object({
      field: v.string(),
      confidence: v.number(),
      extraction_method: v.string() // "rule", "llm", "pattern", "table"
    })),
    
    // Cost metrics
    estimated_cost_usd: v.optional(v.number()),
    tokens_used: v.optional(v.number()),
    
    // Error tracking
    extraction_errors: v.optional(v.number()),
    validation_failures: v.optional(v.number())
  },
  handler: async (ctx, args) => {
    // Calculate quality metrics from extracted metrics
    const totalFields = args.extracted_metrics.length;
    const highConfidence = args.extracted_metrics.filter(m => m.confidence >= 0.9).length;
    const mediumConfidence = args.extracted_metrics.filter(m => m.confidence >= 0.7 && m.confidence < 0.9).length;
    const lowConfidence = args.extracted_metrics.filter(m => m.confidence < 0.7).length;
    const avgConfidence = totalFields > 0 
      ? args.extracted_metrics.reduce((sum, m) => sum + m.confidence, 0) / totalFields 
      : 0;

    // Calculate method breakdown
    const ruleBasedCount = args.extracted_metrics.filter(m => m.extraction_method === "rule").length;
    const llmCount = args.extracted_metrics.filter(m => m.extraction_method === "llm").length;
    const patternCount = args.extracted_metrics.filter(m => m.extraction_method === "pattern").length;
    const tableCount = args.extracted_metrics.filter(m => m.extraction_method === "table").length;

    const kpiId = await ctx.db.insert("extraction_kpis", {
      job_id: args.job_id,
      domain: args.domain,
      profile_version: args.profile_version,
      synonym_map_version: args.synonym_map_version,
      
      // Performance metrics
      total_documents: args.total_documents,
      total_pages: args.total_pages,
      extraction_time_ms: args.extraction_time_ms,
      ocr_time_ms: args.ocr_time_ms,
      llm_time_ms: args.llm_time_ms,
      
      // Quality metrics
      total_fields_extracted: totalFields,
      high_confidence_extractions: highConfidence,
      medium_confidence_extractions: mediumConfidence,
      low_confidence_extractions: lowConfidence,
      avg_confidence: Math.round(avgConfidence * 1000) / 1000,
      
      // Method breakdown
      rule_based_extractions: ruleBasedCount,
      llm_extractions: llmCount,
      pattern_extractions: patternCount,
      table_extractions: tableCount,
      
      // Cost metrics
      estimated_cost_usd: args.estimated_cost_usd,
      tokens_used: args.tokens_used,
      
      // Error tracking
      extraction_errors: args.extraction_errors || 0,
      validation_failures: args.validation_failures || 0,
      
      created_at: new Date().toISOString()
    });

    console.log(`Recorded KPIs for job ${args.job_id}: ${totalFields} fields, ${avgConfidence.toFixed(3)} avg confidence`);
    return kpiId;
  }
});

/**
 * Get KPI dashboard data
 */
export const getKPIDashboard = query({
  args: {
    workspace_id: v.optional(v.id("workspaces")),
    domain: v.optional(v.string()),
    days: v.optional(v.number())
  },
  handler: async (ctx, { workspace_id, domain, days = 30 }) => {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoffIso = cutoffDate.toISOString();

    // Get KPIs within date range
    let query = ctx.db
      .query("extraction_kpis")
      .filter(q => q.gte(q.field("created_at"), cutoffIso));

    if (domain) {
      query = query.filter(q => q.eq(q.field("domain"), domain));
    }

    const kpis = await query.collect();

    if (kpis.length === 0) {
      return {
        period_days: days,
        total_jobs: 0,
        summary: null,
        trends: null
      };
    }

    // Calculate summary metrics
    const totalJobs = kpis.length;
    const totalDocuments = kpis.reduce((sum, k) => sum + k.total_documents, 0);
    const totalPages = kpis.reduce((sum, k) => sum + k.total_pages, 0);
    const totalFields = kpis.reduce((sum, k) => sum + k.total_fields_extracted, 0);
    const avgConfidence = kpis.reduce((sum, k) => sum + k.avg_confidence, 0) / totalJobs;
    const totalExtractionTime = kpis.reduce((sum, k) => sum + k.extraction_time_ms, 0);
    const totalCost = kpis.reduce((sum, k) => sum + (k.estimated_cost_usd || 0), 0);

    // Calculate quality distribution
    const qualityDistribution = {
      high_confidence: kpis.reduce((sum, k) => sum + k.high_confidence_extractions, 0),
      medium_confidence: kpis.reduce((sum, k) => sum + k.medium_confidence_extractions, 0),
      low_confidence: kpis.reduce((sum, k) => sum + k.low_confidence_extractions, 0)
    };

    // Calculate method distribution
    const methodDistribution = {
      rule_based: kpis.reduce((sum, k) => sum + k.rule_based_extractions, 0),
      llm_based: kpis.reduce((sum, k) => sum + k.llm_extractions, 0),
      pattern_based: kpis.reduce((sum, k) => sum + k.pattern_extractions, 0),
      table_based: kpis.reduce((sum, k) => sum + k.table_extractions, 0)
    };

    // Domain breakdown
    const domainBreakdown: Record<string, number> = {};
    for (const kpi of kpis) {
      domainBreakdown[kpi.domain] = (domainBreakdown[kpi.domain] || 0) + 1;
    }

    // Calculate trends (compare first half vs second half of period)
    const midPoint = new Date(cutoffDate.getTime() + (Date.now() - cutoffDate.getTime()) / 2);
    const midPointIso = midPoint.toISOString();
    
    const firstHalf = kpis.filter(k => k.created_at < midPointIso);
    const secondHalf = kpis.filter(k => k.created_at >= midPointIso);
    
    const trends = {
      confidence_trend: secondHalf.length > 0 && firstHalf.length > 0
        ? (secondHalf.reduce((sum, k) => sum + k.avg_confidence, 0) / secondHalf.length) - 
          (firstHalf.reduce((sum, k) => sum + k.avg_confidence, 0) / firstHalf.length)
        : 0,
      speed_trend: secondHalf.length > 0 && firstHalf.length > 0
        ? (firstHalf.reduce((sum, k) => sum + k.extraction_time_ms, 0) / firstHalf.length) -
          (secondHalf.reduce((sum, k) => sum + k.extraction_time_ms, 0) / secondHalf.length)
        : 0,
      volume_trend: secondHalf.length - firstHalf.length
    };

    return {
      period_days: days,
      total_jobs: totalJobs,
      summary: {
        total_documents: totalDocuments,
        total_pages: totalPages,
        total_fields_extracted: totalFields,
        avg_confidence: Math.round(avgConfidence * 1000) / 1000,
        avg_extraction_time_ms: Math.round(totalExtractionTime / totalJobs),
        total_cost_usd: Math.round(totalCost * 100) / 100,
        quality_distribution: qualityDistribution,
        method_distribution: methodDistribution,
        domain_breakdown: domainBreakdown
      },
      trends: {
        confidence_improvement: trends.confidence_trend,
        speed_improvement_ms: trends.speed_trend,
        volume_change: trends.volume_trend
      }
    };
  }
});

/**
 * Create a new profile version
 */
export const createProfileVersion = mutation({
  args: {
    domain: v.string(),
    version: v.string(),
    profile_data: v.any(),
    changelog: v.array(v.object({
      change_type: v.string(),
      description: v.string(),
      author: v.string()
    })),
    created_by: v.string()
  },
  handler: async (ctx, args) => {
    // Deactivate previous version
    const currentVersions = await ctx.db
      .query("profile_versions")
      .filter(q => q.eq(q.field("domain"), args.domain))
      .filter(q => q.eq(q.field("is_active"), true))
      .collect();

    for (const version of currentVersions) {
      await ctx.db.patch(version._id, {
        is_active: false,
        deprecated_at: new Date().toISOString()
      });
    }

    // Create new version
    const versionId = await ctx.db.insert("profile_versions", {
      domain: args.domain,
      version: args.version,
      profile_data: args.profile_data,
      changelog: args.changelog,
      is_active: true,
      created_by: args.created_by,
      created_at: new Date().toISOString()
    });

    console.log(`Created new profile version: ${args.domain} v${args.version}`);
    return versionId;
  }
});

/**
 * Create a new synonym map version
 */
export const createSynonymMapVersion = mutation({
  args: {
    version: v.string(),
    synonym_data: v.any(),
    domains_covered: v.array(v.string()),
    changelog: v.array(v.object({
      change_type: v.string(),
      field_affected: v.optional(v.string()),
      description: v.string(),
      author: v.string()
    })),
    created_by: v.string()
  },
  handler: async (ctx, args) => {
    // Calculate total synonyms
    const totalSynonyms = Object.values(args.synonym_data || {})
      .reduce((total: number, domainSynonyms: any) => {
        return total + Object.values(domainSynonyms || {})
          .reduce((domainTotal: number, fieldSynonyms: any) => {
            return domainTotal + (Array.isArray(fieldSynonyms) ? fieldSynonyms.length : 0);
          }, 0);
      }, 0);

    // Deactivate previous version
    const currentVersions = await ctx.db
      .query("synonym_map_versions")
      .filter(q => q.eq(q.field("is_active"), true))
      .collect();

    for (const version of currentVersions) {
      await ctx.db.patch(version._id, {
        is_active: false,
        deprecated_at: new Date().toISOString()
      });
    }

    // Create new version
    const versionId = await ctx.db.insert("synonym_map_versions", {
      version: args.version,
      synonym_data: args.synonym_data,
      domains_covered: args.domains_covered,
      total_synonyms: totalSynonyms,
      changelog: args.changelog,
      is_active: true,
      created_by: args.created_by,
      created_at: new Date().toISOString()
    });

    console.log(`Created new synonym map version: v${args.version} (${totalSynonyms} synonyms)`);
    return versionId;
  }
});

/**
 * Get active profile version for a domain
 */
export const getActiveProfileVersion = query({
  args: { domain: v.string() },
  handler: async (ctx, { domain }) => {
    const activeVersion = await ctx.db
      .query("profile_versions")
      .filter(q => q.eq(q.field("domain"), domain))
      .filter(q => q.eq(q.field("is_active"), true))
      .first();

    return activeVersion || null;
  }
});

/**
 * Get active synonym map version
 */
export const getActiveSynonymMapVersion = query({
  args: {},
  handler: async (ctx) => {
    const activeVersion = await ctx.db
      .query("synonym_map_versions")
      .filter(q => q.eq(q.field("is_active"), true))
      .first();

    return activeVersion || null;
  }
});

/**
 * Initialize default profile and synonym versions
 */
export const initializeVersioning = mutation({
  args: { created_by: v.string() },
  handler: async (ctx, { created_by }) => {
    const results = [];

    // Create initial profile versions for each domain
    for (const [domainKey, profile] of Object.entries(DOMAIN_PROFILES)) {
      try {
        const versionId = await ctx.db.insert("profile_versions", {
          domain: profile.domain,
          version: "1.0.0",
          profile_data: profile,
          changelog: [{
            change_type: "initial_version",
            description: "Initial domain profile with core fields and synonyms",
            author: created_by
          }],
          is_active: true,
          created_by: created_by,
          created_at: new Date().toISOString()
        });

        results.push({
          domain: profile.domain,
          version: "1.0.0",
          id: versionId
        });
      } catch (error) {
        console.error(`Failed to create profile version for ${profile.domain}:`, error);
      }
    }

    // Create initial synonym map version
    const synonymMapData = {};
    for (const [domainKey, profile] of Object.entries(DOMAIN_PROFILES)) {
      (synonymMapData as any)[profile.domain] = profile.field_synonyms;
    }

    try {
      const synonymVersionId = await ctx.db.insert("synonym_map_versions", {
        version: "1.0.0",
        synonym_data: synonymMapData,
        domains_covered: Object.values(DOMAIN_PROFILES).map(p => p.domain),
        total_synonyms: Object.values(synonymMapData).reduce((total: number, domainSynonyms: any) => {
          return total + Object.values(domainSynonyms).reduce((domainTotal: number, fieldSynonyms: any) => {
            return domainTotal + fieldSynonyms.length;
          }, 0);
        }, 0),
        changelog: [{
          change_type: "initial_version",
          description: "Initial synonym map with multilingual variants",
          author: created_by
        }],
        is_active: true,
        created_by: created_by,
        created_at: new Date().toISOString()
      });

      results.push({
        type: "synonym_map",
        version: "1.0.0",
        id: synonymVersionId
      });
    } catch (error) {
      console.error("Failed to create synonym map version:", error);
    }

    return {
      success: true,
      created: results.length,
      results
    };
  }
});

/**
 * Get version history for a domain
 */
export const getProfileVersionHistory = query({
  args: { domain: v.string() },
  handler: async (ctx, { domain }) => {
    return await ctx.db
      .query("profile_versions")
      .filter(q => q.eq(q.field("domain"), domain))
      .order("desc")
      .collect();
  }
});

/**
 * Get synonym map version history
 */
export const getSynonymMapVersionHistory = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("synonym_map_versions")
      .order("desc")
      .collect();
  }
});

/**
 * Performance analytics by version
 */
export const getPerformanceByVersion = query({
  args: {
    domain: v.optional(v.string()),
    days: v.optional(v.number())
  },
  handler: async (ctx, { domain, days = 30 }) => {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoffIso = cutoffDate.toISOString();

    let query = ctx.db
      .query("extraction_kpis")
      .filter(q => q.gte(q.field("created_at"), cutoffIso));

    if (domain) {
      query = query.filter(q => q.eq(q.field("domain"), domain));
    }

    const kpis = await query.collect();

    // Group by profile version
    const byProfileVersion: Record<string, typeof kpis> = {};
    for (const kpi of kpis) {
      if (!byProfileVersion[kpi.profile_version]) {
        byProfileVersion[kpi.profile_version] = [];
      }
      byProfileVersion[kpi.profile_version].push(kpi);
    }

    // Calculate metrics for each version
    const versionMetrics = Object.entries(byProfileVersion).map(([version, versionKpis]) => {
      const totalJobs = versionKpis.length;
      const avgConfidence = versionKpis.reduce((sum, k) => sum + k.avg_confidence, 0) / totalJobs;
      const avgExtractionTime = versionKpis.reduce((sum, k) => sum + k.extraction_time_ms, 0) / totalJobs;
      const totalFields = versionKpis.reduce((sum, k) => sum + k.total_fields_extracted, 0);
      const avgFieldsPerJob = totalFields / totalJobs;

      return {
        version,
        jobs_count: totalJobs,
        avg_confidence: Math.round(avgConfidence * 1000) / 1000,
        avg_extraction_time_ms: Math.round(avgExtractionTime),
        avg_fields_per_job: Math.round(avgFieldsPerJob * 10) / 10,
        total_fields: totalFields
      };
    });

    // Sort by version (newest first)
    versionMetrics.sort((a, b) => b.version.localeCompare(a.version));

    return {
      period_days: days,
      domain_filter: domain,
      version_metrics: versionMetrics,
      total_versions: versionMetrics.length
    };
  }
});

/**
 * Export KPI data for analysis
 */
export const exportKPIData = query({
  args: {
    domain: v.optional(v.string()),
    days: v.optional(v.number()),
    format: v.union(v.literal("json"), v.literal("csv"))
  },
  handler: async (ctx, { domain, days = 30, format }) => {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoffIso = cutoffDate.toISOString();

    let query = ctx.db
      .query("extraction_kpis")
      .filter(q => q.gte(q.field("created_at"), cutoffIso));

    if (domain) {
      query = query.filter(q => q.eq(q.field("domain"), domain));
    }

    const kpis = await query.collect();

    if (format === "json") {
      return {
        format: "json",
        data: kpis,
        count: kpis.length,
        exported_at: new Date().toISOString()
      };
    } else {
      // Convert to CSV-friendly format
      const csvData = kpis.map(k => ({
        job_id: k.job_id,
        domain: k.domain,
        profile_version: k.profile_version,
        synonym_map_version: k.synonym_map_version,
        total_documents: k.total_documents,
        total_pages: k.total_pages,
        extraction_time_ms: k.extraction_time_ms,
        total_fields_extracted: k.total_fields_extracted,
        avg_confidence: k.avg_confidence,
        high_confidence_extractions: k.high_confidence_extractions,
        medium_confidence_extractions: k.medium_confidence_extractions,
        low_confidence_extractions: k.low_confidence_extractions,
        rule_based_extractions: k.rule_based_extractions,
        llm_extractions: k.llm_extractions,
        pattern_extractions: k.pattern_extractions,
        table_extractions: k.table_extractions,
        estimated_cost_usd: k.estimated_cost_usd,
        tokens_used: k.tokens_used,
        created_at: k.created_at
      }));

      return {
        format: "csv",
        data: csvData,
        count: csvData.length,
        exported_at: new Date().toISOString()
      };
    }
  }
});