import { action, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

// Types
type PdfSpec = { uri: string; vendor_hint?: string | null };

// Helpers
const now = () => Date.now();

async function processPdfViaProcessor(uri: string): Promise<{ tables: any[]; textBlocks: Array<{ id: number; text: string }>; pages?: number }> {
  const base = process.env.PROCESSOR_SERVICE_URL;
  if (!base) {
    // Fallback: no processor available, return empty extraction
    return { tables: [], textBlocks: [], pages: undefined };
  }
  const res = await fetch(`${base.replace(/\/$/, "")}/extract`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pdf_url: uri }),
  });
  if (!res.ok) throw new Error(`Processor error ${res.status}`);
  const data = await res.json();
  return {
    tables: data.tables || [],
    textBlocks: (data.text_blocks || []).map((t: any, idx: number) => ({ id: idx, text: String(t.text || t).slice(0, 2000) })),
    pages: data.pages,
  };
}

function extractLabelValuePairs(text: string): Array<{ label: string; value: string }> {
  const pairs: Array<{ label: string; value: string }> = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^\s*([^:]{2,40})\s*:\s*(.+)$/);
    if (match) {
      const label = match[1].trim();
      const value = match[2].trim();
      if (label && value) {
        pairs.push({ label, value });
      }
    }
  }
  return pairs;
}

function normalizeValueUnit(rawValue: string): { value: string | number | boolean; unit?: string } {
  // Very simple heuristic normalization for MVP
  const num = Number(rawValue.replace(/[, ]/g, ""));
  if (!Number.isNaN(num) && /[0-9]/.test(rawValue)) {
    // Extract unit suffix if present (e.g., "ms", "s", "MB", "GB")
    const unitMatch = rawValue.match(/([a-zA-Z%]+)$/);
    const unit = unitMatch ? unitMatch[1] : undefined;
    return { value: num, unit };
  }
  const lowered = rawValue.toLowerCase();
  if (["yes", "true", "supported", "available"].includes(lowered)) return { value: true };
  if (["no", "false", "not supported", "unavailable", "—", "-"].includes(lowered)) return { value: false };
  return { value: rawValue };
}

function pickBestValue(values: Array<any>) {
  // For MVP, take the first (could be improved with confidence)
  return values[0];
}

export const getActiveSynonymMapQuery = query({
  handler: async (ctx) => {
    const map = await ctx.db.query("synonymMaps").withIndex("by_active", (q) => q.eq("active", true)).first();
    return map;
  },
});

function mapLabelToCanonical(entries: any[], label: string): { metricId?: string; metricLabel?: string; optimality?: "max" | "min" } {
  if (!entries) return {};
  const lowered = label.toLowerCase();
  for (const entry of entries) {
    if (entry.metricLabel?.toLowerCase() === lowered) {
      return { metricId: entry.canonicalMetricId, metricLabel: entry.metricLabel, optimality: entry.optimality };
    }
    if (Array.isArray(entry.synonyms)) {
      for (const s of entry.synonyms) {
        if (s.toLowerCase() === lowered) {
          return { metricId: entry.canonicalMetricId, metricLabel: entry.metricLabel, optimality: entry.optimality };
        }
      }
    }
  }
  return {};
}

export const seedSynonymMapV1 = mutation({
  handler: async (ctx) => {
    const existing = await ctx.db.query("synonymMaps").withIndex("by_active", q => q.eq("active", true)).first();
    if (existing) return existing;
    const version = `v1-${Date.now()}`;
    const entries = [
      {
        canonicalMetricId: "THROUGHPUT_RPS",
        metricLabel: "Throughput (req/s)",
        synonyms: ["throughput", "req/s", "requests per second", "rps"],
        unitRules: { base: "rps" },
        priority: 10,
        optimality: "max",
      },
      {
        canonicalMetricId: "LATENCY_MS",
        metricLabel: "Latency (ms)",
        synonyms: ["latency", "response time", "rt", "ms"],
        unitRules: { base: "ms" },
        priority: 10,
        optimality: "min",
      },
      {
        canonicalMetricId: "PRICE_USD",
        metricLabel: "Price (USD)",
        synonyms: ["price", "pricing", "cost"],
        unitRules: { base: "USD" },
        priority: 5,
        optimality: "min",
      },
    ];
    const id = await ctx.db.insert("synonymMaps", {
      version,
      active: true,
      entries,
      lastUpdated: now(),
    });
    return await ctx.db.get(id);
  },
});

export const createComparisonJob = mutation({
  args: {
    pdf_list: v.array(
      v.object({
        uri: v.optional(v.string()),
        storageId: v.optional(v.id("_storage")),
        vendor_hint: v.optional(v.string()),
      })
    ),
    job_name: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Ensure synonym map
    await ctx.runMutation(api.pipeline.seedSynonymMapV1 as any);

    const jobId = await ctx.db.insert("comparisonJobs", {
      name: args.job_name,
      status: "queued",
      createdAt: now(),
      updatedAt: now(),
      progress: { total: args.pdf_list.length, completed: 0, stage: "queued" },
      synonymMapVersion: undefined,
    });

    // Create documents + extractionJobs
    for (const spec of args.pdf_list as any[]) {
      // Resolve URI: prefer provided uri, otherwise generate from storageId
      let resolvedUri: string | undefined = spec.uri;
      if (!resolvedUri && spec.storageId) {
        const tmpUrl = await ctx.storage.getUrl(spec.storageId);
        resolvedUri = tmpUrl ?? undefined;
      }
      const docId = await ctx.db.insert("documents", {
        jobId: jobId as Id<"comparisonJobs">,
        vendorName: spec.vendor_hint || undefined,
        sourceUri: resolvedUri,
        storageId: spec.storageId,
        ingestedAt: now(),
        docType: undefined,
        pages: undefined,
        ocrUsed: undefined,
      });
      await ctx.db.insert("extractionJobs", {
        jobId: jobId as Id<"comparisonJobs">,
        documentId: docId as Id<"documents">,
        vendorName: spec.vendor_hint || undefined,
        status: "pending",
        error: undefined,
        qualityScore: undefined,
        createdAt: now(),
        updatedAt: now(),
      });
    }

    // Kick processing in background
    await ctx.scheduler.runAfter(0, api.pipeline.processAllDocumentsForJob, { jobId: jobId as Id<"comparisonJobs"> });

    return { job_id: String(jobId), status_url: `/api/jobs/status?jobId=${String(jobId)}` };
  },
});

// Utility queries/mutations used by actions
export const getExtractionJobsByJob = query({
  args: { jobId: v.id("comparisonJobs") },
  handler: async (ctx, args) => {
    return await ctx.db.query("extractionJobs").withIndex("by_job", (q) => q.eq("jobId", args.jobId)).collect();
  },
});

export const getExtractionJobById = query({
  args: { extractionJobId: v.id("extractionJobs") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.extractionJobId);
  },
});

export const getDocumentById = query({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.documentId);
  },
});

export const patchJob = mutation({
  args: { jobId: v.id("comparisonJobs"), status: v.optional(v.string()), progress: v.optional(v.object({ total: v.number(), completed: v.number(), stage: v.string() })), updatedAt: v.number() },
  handler: async (ctx, args) => {
    const { jobId, ...rest } = args as any;
    await ctx.db.patch(jobId, rest);
  },
});

export const insertRawExtraction = mutation({
  args: { documentId: v.id("documents"), tables: v.any(), textBlocks: v.any(), extractionQuality: v.optional(v.number()), pageRefs: v.optional(v.any()), createdAt: v.number() },
  handler: async (ctx, args) => {
    await ctx.db.insert("rawExtractions", args);
  },
});

export const insertNormalizedMetricsMutation = mutation({
  args: { documentId: v.id("documents"), metrics: v.any(), createdAt: v.number() },
  handler: async (ctx, args) => {
    await ctx.db.insert("normalizedMetrics", args);
  },
});

export const patchExtractionJob = mutation({
  args: { extractionJobId: v.id("extractionJobs"), status: v.optional(v.string()), updatedAt: v.number(), qualityScore: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const { extractionJobId, ...rest } = args as any;
    await ctx.db.patch(extractionJobId, rest);
  },
});

export const getDocumentsByJob = query({
  args: { jobId: v.id("comparisonJobs") },
  handler: async (ctx, args) => {
    return await ctx.db.query("documents").withIndex("by_job", (q) => q.eq("jobId", args.jobId)).collect();
  },
});

export const getNormalizedMetricsByDocument = query({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    return await ctx.db.query("normalizedMetrics").withIndex("by_document", (q) => q.eq("documentId", args.documentId)).first();
  },
});

export const insertComparisonArtifact = mutation({
  args: { jobId: v.id("comparisonJobs"), type: v.string(), data: v.any(), createdAt: v.number() },
  handler: async (ctx, args) => {
    await ctx.db.insert("comparisonArtifacts", { ...args, storageId: undefined });
  },
});

export const processAllDocumentsForJob = action({
  args: { jobId: v.id("comparisonJobs") },
  handler: async (ctx, args) => {
    const job = await ctx.runQuery(api.pipeline.getJobStatus as any, { jobId: args.jobId });
    await ctx.runMutation(api.pipeline.patchJob as any, { jobId: args.jobId, status: "extracting", updatedAt: now(), progress: { total: (job?.per_document?.length ?? 0), completed: 0, stage: "extracting" } });

    const extractionJobs = await ctx.runQuery(api.pipeline.getExtractionJobsByJob, { jobId: args.jobId });
    let completed = 0;
    let failures = 0;
    for (const ej of extractionJobs) {
      try {
        await ctx.runAction(api.pipeline.processExtractionJob, { extractionJobId: ej._id as Id<"extractionJobs"> });
        completed += 1;
      } catch (e: any) {
        failures += 1;
        console.error("Extraction failed", e?.message || e);
      }
      await ctx.runMutation(api.pipeline.patchJob as any, { jobId: args.jobId, updatedAt: now(), progress: { total: extractionJobs.length, completed, stage: "extracting" } });
    }

    await ctx.runAction(api.pipeline.aggregateJob, { jobId: args.jobId });
    const finalStatus = failures > 0 && completed > 0 ? "ready_partial" : failures === extractionJobs.length ? "failed_no_signal" : "ready";
    await ctx.runMutation(api.pipeline.patchJob as any, { jobId: args.jobId, status: finalStatus, updatedAt: now() });
  },
});

export const processExtractionJob = action({
  args: { extractionJobId: v.id("extractionJobs") },
  handler: async (ctx, args) => {
    const ej = await ctx.runQuery(api.pipeline.getExtractionJobById, { extractionJobId: args.extractionJobId });
    if (!ej) throw new Error("Extraction job not found");
    await ctx.runMutation(api.pipeline.patchExtractionJob, { extractionJobId: args.extractionJobId, status: "extracting", updatedAt: now() });

    const document = await ctx.runQuery(api.pipeline.getDocumentById, { documentId: ej.documentId as Id<"documents"> });
    if (!document) throw new Error("Document not found");

    // Process via external processor
    const processed = await processPdfViaProcessor((document as any).sourceUri);
    const assembledText = processed.textBlocks.map(b => b.text).join("\n\n");
    const labelValuePairs = extractLabelValuePairs(assembledText);
    const tables: any[] = processed.tables;
    const textBlocks = processed.textBlocks;

    await ctx.runMutation(api.pipeline.insertRawExtraction, {
      documentId: (document as any)._id as Id<"documents">,
      tables,
      textBlocks,
      extractionQuality: Math.min(1, labelValuePairs.length / 20),
      pageRefs: { pages: processed.pages },
      createdAt: now(),
    });

    // Normalization
    const synonymMap = await ctx.runQuery(api.pipeline.getActiveSynonymMapQuery);
    const metrics: any[] = [];
    for (const { label, value } of labelValuePairs) {
      const mapping = mapLabelToCanonical(synonymMap?.entries || [], label);
      if (!mapping.metricId) {
        // propose synonym for high-confidence candidates (heuristic: numbers present)
        const confidence = /[0-9]/.test(value) ? 0.8 : 0.5;
        if (confidence >= 0.75) {
          await ctx.runMutation(api.pipeline.proposeSynonym as any, {
            labelRaw: label,
            context: undefined,
            suggestedMetricId: undefined,
            confidence,
            vendorName: (document as any).vendorName,
            jobId: ej.jobId as Id<"comparisonJobs">,
            documentId: (document as any)._id as Id<"documents">,
            status: "proposed",
            createdAt: now(),
          });
        }
        continue;
      }
      const norm = normalizeValueUnit(value);
      metrics.push({
        metricId: mapping.metricId,
        metricLabel: mapping.metricLabel,
        value_normalized: norm.value,
        unit_normalized: norm.unit,
        confidence: 0.8,
        source_ref: { type: "text", sample: value.slice(0, 120) },
        normalization_version: synonymMap?.version,
      });
    }

    await ctx.runMutation(api.pipeline.insertNormalizedMetricsMutation, {
      documentId: (document as any)._id as Id<"documents">,
      metrics,
      createdAt: now(),
    });

    await ctx.runMutation(api.pipeline.patchExtractionJob, { extractionJobId: args.extractionJobId, status: "normalized", updatedAt: now(), qualityScore: Math.min(1, metrics.length / 15) });
  },
});

export const aggregateJob = action({
  args: { jobId: v.id("comparisonJobs") },
  handler: async (ctx, args) => {
    // Move to aggregating state
    await ctx.runMutation(api.pipeline.patchJob as any, { jobId: args.jobId, updatedAt: now(), status: "aggregating" });

    const docs = await ctx.runQuery(api.pipeline.getDocumentsByJob, { jobId: args.jobId });
    const vendors = docs.map((d: any) => d.vendorName || `Vendor ${String(d._id).slice(-4)}`);
    const normalizedByDoc: Record<string, any[]> = {};
    for (const d of docs) {
      const nm = await ctx.runQuery(api.pipeline.getNormalizedMetricsByDocument, { documentId: d._id as Id<"documents"> });
      normalizedByDoc[String(d._id)] = nm?.metrics || [];
    }

    // Build metric union
    const metricSet = new Map<string, { metricLabel: string; optimality?: "max" | "min" }>();
    const synonymMap = await ctx.runQuery(api.pipeline.getActiveSynonymMapQuery);
    for (const entry of synonymMap?.entries || []) {
      metricSet.set(entry.canonicalMetricId, { metricLabel: entry.metricLabel, optimality: entry.optimality });
    }
    for (const docId in normalizedByDoc) {
      for (const m of normalizedByDoc[docId]) {
        if (!metricSet.has(m.metricId)) {
          metricSet.set(m.metricId, { metricLabel: m.metricLabel, optimality: undefined });
        }
      }
    }

    const metrics = Array.from(metricSet.entries()).map(([metricId, meta]) => ({ metricId, metricLabel: meta.metricLabel, optimality: meta.optimality }));

    const matrix: Record<string, Record<string, any>> = {};
    for (const metric of metrics) {
      matrix[metric.metricId] = {};
      for (const d of docs) {
        const values = (normalizedByDoc[String(d._id)] || []).filter(m => m.metricId === metric.metricId);
        matrix[metric.metricId][String(d._id)] = values.length ? pickBestValue(values) : null;
      }
    }

    // Compute deltas and best vendor by metric
    const deltas: Record<string, number | null> = {};
    const best_vendor_by_metric: Record<string, string | null> = {};
    for (const metric of metrics) {
      const values: Array<{ id: string; value: any }> = [];
      for (const d of docs) {
        const cell = matrix[metric.metricId][String(d._id)];
        if (cell && typeof cell.value_normalized === "number") {
          values.push({ id: String(d._id), value: cell.value_normalized });
        }
      }
      if (values.length >= 2) {
        const nums = values.map(v => v.value);
        const max = Math.max(...nums);
        const min = Math.min(...nums);
        deltas[metric.metricId] = max === 0 ? 0 : (max - min) / (metric.optimality === "min" ? max : min);
        if (metric.optimality === "min") {
          const best = values.reduce((a, b) => (b.value < a.value ? b : a));
          best_vendor_by_metric[metric.metricId] = best.id;
        } else {
          const best = values.reduce((a, b) => (b.value > a.value ? b : a));
          best_vendor_by_metric[metric.metricId] = best.id;
        }
      } else {
        deltas[metric.metricId] = null;
        best_vendor_by_metric[metric.metricId] = null;
      }
    }

    const missing_flags: Record<string, Record<string, boolean>> = {};
    for (const d of docs) {
      missing_flags[String(d._id)] = {};
      for (const metric of metrics) {
        missing_flags[String(d._id)][metric.metricId] = matrix[metric.metricId][String(d._id)] === null;
      }
    }

    const dataset = {
      vendors: docs.map((d: any) => ({ id: String(d._id), name: d.vendorName || `Vendor ${String(d._id).slice(-4)}` })),
      metrics: metrics.map(m => ({ metric_id: m.metricId, label: m.metricLabel, optimality: m.optimality })),
      matrix,
      deltas,
      best_vendor_by_metric,
      missing_flags,
      synonym_map_version: synonymMap?.version,
    };

    await ctx.runMutation(api.pipeline.insertComparisonArtifact, { jobId: args.jobId, type: "comparisonDataset", data: dataset, createdAt: now() });
  },
});

export const getJobStatus = query({
  args: { jobId: v.id("comparisonJobs") },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    const docs = await ctx.db.query("documents").withIndex("by_job", q => q.eq("jobId", args.jobId)).collect();
    const extractions = await ctx.db.query("extractionJobs").withIndex("by_job", q => q.eq("jobId", args.jobId)).collect();
    return {
      job,
      per_document: docs.map((d: any) => ({
        documentId: String(d._id),
        vendor: d.vendorName,
        extraction: extractions.find((e: any) => String(e.documentId) === String(d._id)) || null,
      })),
    };
  },
});

export const getComparisonDataset = query({
  args: { jobId: v.id("comparisonJobs") },
  handler: async (ctx, args) => {
    const artifact = await ctx.db.query("comparisonArtifacts").withIndex("by_job", q => q.eq("jobId", args.jobId)).first();
    return artifact?.data || null;
  },
});

export const proposeSynonym = mutation({
  args: { label_raw: v.string(), context: v.optional(v.string()), suggested_metric_id: v.optional(v.string()), confidence: v.number() },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("proposedSynonyms", {
      labelRaw: args.label_raw,
      context: args.context,
      suggestedMetricId: args.suggested_metric_id,
      confidence: args.confidence,
      vendorName: undefined,
      jobId: undefined,
      documentId: undefined,
      status: "proposed",
      createdAt: now(),
    });
    return await ctx.db.get(id);
  },
});

export const approveSynonym = mutation({
  args: { label_raw: v.string(), canonical_metric_id: v.string(), metric_label: v.string(), synonyms: v.array(v.string()) },
  handler: async (ctx, args) => {
    // Mark proposals as approved
    const props = await ctx.db.query("proposedSynonyms").withIndex("by_status", q => q.eq("status", "proposed")).collect();
    for (const p of props) {
      if (p.labelRaw.toLowerCase() === args.label_raw.toLowerCase()) {
        await ctx.db.patch(p._id, { status: "approved" });
      }
    }

    // Create new synonym map version appending entry
    const active = await ctx.db.query("synonymMaps").withIndex("by_active", q => q.eq("active", true)).first();
    if (!active) throw new Error("No active synonym map");

    const version = `v${Number((active.version.match(/v(\d+)/)?.[1] || 1)) + 1}-${Date.now()}`;
    const entries = [...active.entries, {
      canonicalMetricId: args.canonical_metric_id,
      metricLabel: args.metric_label,
      synonyms: args.synonyms,
      unitRules: {},
      priority: 1,
      optimality: "max",
    }];

    // Deactivate old
    await ctx.db.patch(active._id, { active: false });
    const id = await ctx.db.insert("synonymMaps", { version, active: true, entries, lastUpdated: now() });
    return await ctx.db.get(id);
  },
});


