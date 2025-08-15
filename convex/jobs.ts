/**
 * Job Processing Pipeline - Production Ready
 * Implements PRD Section 5 (Architecture) and Section 10 (State Machine)
 * State machine: CREATED → UPLOADED → CLASSIFIED → PARSED → EXTRACTED → NORMALIZED → BUILT → READY
 */

import { action, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { classifyDomain, combineClassifications, classifyFromFilename } from "./domain_classifier";
import { getDomainProfile } from "./domain_profiles";

const now = () => Date.now();

// State machine states from PRD Section 10
type JobStatus = 
  | "CREATED"
  | "UPLOADED" 
  | "CLASSIFIED"
  | "PARSED"
  | "EXTRACTED"
  | "NORMALIZED"
  | "BUILT"
  | "READY"
  | "FAILED"
  | "PARTIAL"
  | "CANCELLED";

// === JOB CREATION & MANAGEMENT ===

export const createJob = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    domainMode: v.optional(v.string()), // "auto" | "forced"
    domain: v.optional(v.string()), // forced domain if domainMode = "forced"
  },
  handler: async (ctx, args) => {
    const jobId = await ctx.db.insert("jobs", {
      workspaceId: args.workspaceId,
      status: "CREATED",
      domainMode: args.domainMode || "auto",
      domain: args.domain,
      profileVersion: undefined,
      createdAt: now(),
      metrics: {
        latencyMs: undefined,
        pagesTotal: 0,
        ocrPages: 0,
        costEstimate: 0,
      },
      error: undefined,
    });

    // Log job creation
    await ctx.db.insert("auditLogs", {
      workspaceId: args.workspaceId,
      actor: "system", // TODO: Get from auth context
      action: "create_job",
      target: jobId,
      metadata: { domainMode: args.domainMode, domain: args.domain },
      createdAt: now(),
    });

    return jobId;
  },
});

export const getJob = query({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.jobId);
  },
});

export const getJobWithDocuments = query({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) return null;

    const documents = await ctx.db
      .query("documents")
      .withIndex("by_job", (q) => q.eq("jobId", args.jobId))
      .collect();

    return {
      job,
      documents: documents.length,
      documentsDetail: documents.map(doc => ({
        id: doc._id,
        filename: doc.filename,
        pages: doc.pages,
        qualityScore: doc.qualityScore,
      })),
    };
  },
});

export const getWorkspaceJobs = query({
  args: { 
    workspaceId: v.id("workspaces"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let jobQuery = ctx.db
      .query("jobs")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .order("desc");
    
    const jobs = args.limit ? await jobQuery.take(args.limit) : await jobQuery.collect();
    
    // Get document counts for each job
    const jobsWithCounts = [];
    for (const job of jobs) {
      const documentCount = await ctx.db
        .query("documents")
        .withIndex("by_job", (q) => q.eq("jobId", job._id))
        .collect()
        .then(docs => docs.length);
      
      jobsWithCounts.push({
        ...job,
        documentCount,
      });
    }
    
    return jobsWithCounts;
  },
});

export const getJobDocuments = query({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("documents")
      .withIndex("by_job", (q) => q.eq("jobId", args.jobId))
      .collect();
  },
});

export const getDocumentArtifacts = query({
  args: { 
    documentId: v.id("documents"),
    type: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    let query = ctx.db
      .query("artifacts")
      .withIndex("by_document", (q) => q.eq("documentId", args.documentId));
    
    if (args.type) {
      query = query.filter((q) => q.eq(q.field("type"), args.type));
    }
    
    return await query.collect();
  },
});

// === DOCUMENT UPLOAD & MANAGEMENT ===

export const uploadDocument = action({
  args: {
    jobId: v.id("jobs"),
    filename: v.string(),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    // Get PDF URL and calculate hash
    const pdfUrl = await ctx.storage.getUrl(args.storageId);
    if (!pdfUrl) {
      throw new Error("Could not get PDF URL from storage");
    }

    // Simple hash based on filename and current time for uniqueness
    const hash = `${args.filename}-${Date.now()}`;

    // Create document record
    const documentId = await ctx.runMutation(api.jobs.insertDocument, {
      jobId: args.jobId,
      filename: args.filename,
      hash,
      storageUrl: pdfUrl,
      storageId: args.storageId,
      createdAt: now(),
    });

    // Update job status to UPLOADED
    await ctx.runMutation(api.jobs.updateJobStatus, {
      jobId: args.jobId,
      status: "UPLOADED",
    });

    return documentId;
  },
});

export const insertDocument = mutation({
  args: {
    jobId: v.id("jobs"),
    filename: v.string(),
    hash: v.string(),
    storageUrl: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
    pages: v.optional(v.number()),
    qualityScore: v.optional(v.number()),
    createdAt: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("documents", {
      jobId: args.jobId,
      filename: args.filename,
      hash: args.hash,
      storageUrl: args.storageUrl,
      storageId: args.storageId,
      pages: args.pages,
      mime: "application/pdf",
      qualityScore: args.qualityScore,
      createdAt: args.createdAt,
    });
  },
});

// === JOB STATE MANAGEMENT ===

export const updateJobStatus = mutation({
  args: {
    jobId: v.id("jobs"),
    status: v.string(),
    error: v.optional(v.string()),
    metrics: v.optional(v.object({
      latencyMs: v.optional(v.number()),
      pagesTotal: v.optional(v.number()),
      ocrPages: v.optional(v.number()),
      costEstimate: v.optional(v.number()),
    })),
  },
  handler: async (ctx, args) => {
    const status = args.status as JobStatus;
    
    const updateData: any = { status };
    if (args.error) updateData.error = args.error;
    if (args.metrics) updateData.metrics = args.metrics;
    
    await ctx.db.patch(args.jobId, updateData);
  },
});

export const insertDomainClassification = mutation({
  args: {
    documentId: v.id("documents"),
    domain: v.string(),
    confidence: v.number(),
    method: v.string(),
    alternativeDomains: v.array(v.string()),
    requiresConfirmation: v.boolean(),
    evidence: v.object({
      primaryMatches: v.array(v.string()),
      secondaryMatches: v.array(v.string()),
      sectionMatches: v.array(v.string()),
      negativeMatches: v.array(v.string()),
    }),
    createdAt: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("domainClassifications", args);
  },
});

export const cancelJob = mutation({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.jobId, { 
      status: "CANCELLED",
      error: "Job cancelled by user",
    });
  },
});

// === PROCESSING PIPELINE ORCHESTRATION ===

export const processJob = action({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, args) => {
    const job = await ctx.runQuery(api.jobs.getJob, { jobId: args.jobId });
    if (!job) throw new Error("Job not found");

    const startTime = Date.now();
    
    try {
      // STEP 1: Classification
      if (job.status === "UPLOADED") {
        await ctx.runAction(api.jobs.classifyJobDocuments, { jobId: args.jobId });
      }

      // STEP 2: Parsing  
      if (job.status === "CLASSIFIED") {
        await ctx.runAction(api.jobs.parseJobDocuments, { jobId: args.jobId });
      }

      // STEP 3: Extraction
      if (job.status === "PARSED") {
        await ctx.runAction(api.jobs.extractJobDocuments, { jobId: args.jobId });
      }

      // STEP 4: Normalization
      if (job.status === "EXTRACTED") {
        await ctx.runAction(api.jobs.normalizeJobDocuments, { jobId: args.jobId });
      }

      // STEP 5: Build Results
      if (job.status === "NORMALIZED") {
        await ctx.runAction(api.jobs.buildJobResults, { jobId: args.jobId });
      }

      // Calculate final metrics
      const endTime = Date.now();
      const latencyMs = endTime - startTime;

      await ctx.runMutation(api.jobs.updateJobStatus, {
        jobId: args.jobId,
        status: "READY",
        metrics: {
          latencyMs,
          pagesTotal: job.metrics?.pagesTotal || 0,
          ocrPages: job.metrics?.ocrPages || 0,
          costEstimate: job.metrics?.costEstimate || 0,
        },
      });

    } catch (error: any) {
      console.error("Job processing failed:", error);
      
      await ctx.runMutation(api.jobs.updateJobStatus, {
        jobId: args.jobId,
        status: "FAILED",
        error: error.message || "Unknown processing error",
      });
    }
  },
});

// STEP 1: Classification
export const classifyJobDocuments = action({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, args) => {
    const documents = await ctx.runQuery(api.jobs.getJobDocuments, { jobId: args.jobId });

    let finalDomain: string | undefined;
    let highestConfidence = 0;

    // Classify each document and find consensus
    for (const document of documents) {
      // Get document artifacts for classification
      const artifacts = await ctx.runQuery(api.jobs.getDocumentArtifacts, { 
        documentId: document._id,
        type: "text"
      });

      if (artifacts.length === 0) {
        // If no artifacts, try to extract basic text first
        console.log("No text artifacts found for document, creating minimal classification");
        
        // Create a basic classification based on filename
        const filenameClassification = classifyFromFilename(document.filename);
        if (filenameClassification && filenameClassification.confidence! > highestConfidence) {
          finalDomain = filenameClassification.domain;
          highestConfidence = filenameClassification.confidence!;
        }
        continue;
      }

      // Extract text blocks from artifacts
      const textBlocks = artifacts
        .flatMap(artifact => artifact.payload?.textBlocks || [])
        .map(block => ({ text: block.text || "", page: block.page || 1 }));

      // Classify domain
      const contentClassification = classifyDomain(textBlocks, []);
      const filenameClassification = classifyFromFilename(document.filename);
      
      const classification = combineClassifications(contentClassification, filenameClassification);

      // Store classification
      await ctx.runMutation(api.jobs.insertDomainClassification, {
        documentId: document._id,
        domain: classification.domain,
        confidence: classification.confidence,
        method: classification.method,
        alternativeDomains: classification.alternative_domains || [],
        requiresConfirmation: classification.requires_user_confirmation,
        evidence: {
          primaryMatches: classification.evidence.primaryMatches,
          secondaryMatches: classification.evidence.secondaryMatches,
          sectionMatches: classification.evidence.sectionMatches,
          negativeMatches: classification.evidence.negativeMatches,
        },
        createdAt: now(),
      });

      // Update highest confidence domain
      if (classification.confidence > highestConfidence) {
        finalDomain = classification.domain;
        highestConfidence = classification.confidence;
      }
    }

    // Update job with classified domain
    if (finalDomain) {
      const profile = getDomainProfile(finalDomain as any);
      
      await ctx.runMutation(api.jobs.updateJobStatus, {
        jobId: args.jobId,
        status: "CLASSIFIED",
      });

      // Also update the domain and profile version
      await ctx.db.patch(args.jobId, {
        domain: finalDomain,
        profileVersion: profile.version,
      });
    } else {
      throw new Error("Could not classify any documents in job");
    }
  },
});

// STEP 2: Parsing (PDF → structured data)
export const parseJobDocuments = action({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, args) => {
    const documents = await ctx.db
      .query("documents")
      .withIndex("by_job", (q) => q.eq("jobId", args.jobId))
      .collect();

    let totalPages = 0;
    let ocrPages = 0;

    for (const document of documents) {
      if (!document.storageId) {
        console.log("Document has no storageId, skipping parsing");
        continue;
      }

      // Process via OCR Worker
      const processed = await processPdfViaOcrWorker(ctx, document.storageId);
      totalPages += processed.pages || 0;
      ocrPages += processed.ocrUsed ? (processed.pages || 0) : 0;

      // Store artifacts
      if (processed.textBlocks && processed.textBlocks.length > 0) {
        // Store text artifacts by page
        const textByPage = new Map<number, any[]>();
        for (const block of processed.textBlocks) {
          const page = block.page || 1;
          if (!textByPage.has(page)) textByPage.set(page, []);
          textByPage.get(page)!.push(block);
        }

        for (const [page, blocks] of textByPage) {
          await ctx.db.insert("artifacts", {
            documentId: document._id,
            page,
            type: "text",
            payload: { textBlocks: blocks },
            bboxMap: undefined,
            createdAt: now(),
          });
        }
      }

      // Store table artifacts
      if (processed.tables && processed.tables.length > 0) {
        for (let i = 0; i < processed.tables.length; i++) {
          const table = processed.tables[i];
          await ctx.db.insert("artifacts", {
            documentId: document._id,
            page: table.page || 1,
            type: "table",
            payload: { table },
            bboxMap: table.bboxMap,
            createdAt: now(),
          });
        }
      }

      // Update document with page count and quality score
      await ctx.db.patch(document._id, {
        pages: processed.pages,
        qualityScore: Math.min(1.0, (processed.textBlocks?.length || 0) / 10),
      });
    }

    // Update job status and metrics
    await ctx.runMutation(api.jobs.updateJobStatus, {
      jobId: args.jobId,
      status: "PARSED",
      metrics: {
        latencyMs: undefined,
        pagesTotal: totalPages,
        ocrPages,
        costEstimate: ocrPages * 0.001, // $0.001 per OCR page estimate
      },
    });
  },
});

// Helper function to process PDF via OCR Worker (reusing from pipeline.ts)
async function processPdfViaOcrWorker(ctx: any, storageId: string): Promise<{ 
  tables: any[]; 
  textBlocks: Array<{ id: number; text: string; page?: number }>; 
  pages?: number;
  ocrUsed?: boolean;
}> {
  try {
    const pdfUrl = await ctx.storage.getUrl(storageId);
    if (!pdfUrl) {
      throw new Error("Could not get PDF URL from storage");
    }

    const ocrWorkerUrl = process.env.OCR_WORKER_URL || process.env.PROCESSOR_SERVICE_URL;
    if (!ocrWorkerUrl) {
      throw new Error("OCR_WORKER_URL not configured");
    }

    const response = await fetch(`${ocrWorkerUrl.replace(/\/$/, '')}/process-pdf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pdf_url: pdfUrl }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OCR Worker failed: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    
    return {
      tables: result.tables || [],
      textBlocks: (result.text_blocks || []).map((t: any, idx: number) => ({ 
        id: idx, 
        text: String(t.text || '').slice(0, 4000),
        page: t.page || idx + 1
      })),
      pages: result.pages || 1,
      ocrUsed: result.ocr_used || false,
    };
    
  } catch (error: any) {
    console.error("OCR Worker processing failed:", error?.message || error);
    
    return { 
      tables: [], 
      textBlocks: [{ 
        id: 0, 
        text: `PDF processing failed: ${error?.message || 'Unknown error'}`,
        page: 1
      }], 
      pages: 1,
      ocrUsed: false,
    };
  }
}

// STEP 3: Extraction (structured data → raw fields)
export const extractJobDocuments = action({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, args) => {
    const job = await ctx.runQuery(api.jobs.getJob, { jobId: args.jobId });
    if (!job || !job.domain) {
      throw new Error("Job domain not classified yet");
    }

    const documents = await ctx.db
      .query("documents")
      .withIndex("by_job", (q) => q.eq("jobId", args.jobId))
      .collect();

    const domainProfile = getDomainProfile(job.domain as any);
    const openaiApiKey = process.env.OPENAI_API_KEY;

    for (const document of documents) {
      // Get text artifacts for this document
      const textArtifacts = await ctx.db
        .query("artifacts")
        .withIndex("by_document", (q) => q.eq("documentId", document._id))
        .filter((q) => q.eq(q.field("type"), "text"))
        .collect();

      // Get table artifacts for this document
      const tableArtifacts = await ctx.db
        .query("artifacts")
        .withIndex("by_document", (q) => q.eq("documentId", document._id))
        .filter((q) => q.eq(q.field("type"), "table"))
        .collect();

      if (textArtifacts.length === 0) {
        console.log("No text artifacts found for document", document._id);
        continue;
      }

      // Convert artifacts to format expected by LangChain parser
      const textBlocks = textArtifacts.flatMap(artifact => 
        (artifact.payload?.textBlocks || []).map((block: any) => ({
          text: block.text || "",
          page: artifact.page,
        }))
      );

      const tables = tableArtifacts.map(artifact => artifact.payload?.table || {});

      // Extract metrics using LangChain + domain profile
      const { extractMetricCandidates } = await import("./langchain_parser");
      const candidates = await extractMetricCandidates(
        textBlocks,
        tables,
        openaiApiKey,
        domainProfile
      );

      console.log(`Extracted ${candidates.length} metric candidates for document ${document._id}`);

      // Store raw extractions
      for (const candidate of candidates) {
        await ctx.db.insert("extractionsRaw", {
          documentId: document._id,
          fieldId: candidate.label.toLowerCase().replace(/\s+/g, '_'),
          fieldLabel: candidate.label,
          valueRaw: String(candidate.value),
          unitRaw: candidate.unit,
          source: {
            page: candidate.pageRef || 1,
            bbox: undefined, // TODO: Extract from OCR bbox data
            method: "langchain",
          },
          confidence: candidate.confidence,
          candidates: undefined,
          createdAt: now(),
        });
      }
    }

    await ctx.runMutation(api.jobs.updateJobStatus, {
      jobId: args.jobId,
      status: "EXTRACTED",
    });
  },
});

// STEP 4: Normalization (raw fields → normalized fields)  
export const normalizeJobDocuments = action({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, args) => {
    const job = await ctx.runQuery(api.jobs.getJob, { jobId: args.jobId });
    if (!job || !job.domain) {
      throw new Error("Job domain not classified yet");
    }

    const documents = await ctx.db
      .query("documents")
      .withIndex("by_job", (q) => q.eq("jobId", args.jobId))
      .collect();

    const domainProfile = getDomainProfile(job.domain as any);

    for (const document of documents) {
      // Get raw extractions for this document
      const rawExtractions = await ctx.db
        .query("extractionsRaw")
        .withIndex("by_document", (q) => q.eq("documentId", document._id))
        .collect();

      console.log(`Normalizing ${rawExtractions.length} raw extractions for document ${document._id}`);

      for (const extraction of rawExtractions) {
        // Normalize the value using domain profile rules
        const normalized = normalizeValueWithProfile(
          extraction.valueRaw,
          extraction.unitRaw,
          extraction.fieldId,
          domainProfile
        );

        // Validate against domain profile bounds
        const { validateFieldValue } = await import("./domain_profiles");
        const validation = validateFieldValue(
          job.domain as any,
          extraction.fieldId,
          normalized.value,
          normalized.unit
        );

        // Determine flags
        const flags: string[] = [];
        if (!validation.isValid) {
          flags.push(validation.status);
        }
        if (extraction.confidence < 0.6) {
          flags.push("low_confidence");
        }
        if (normalized.wasConverted) {
          flags.push("unit_converted");
        }

        // Store normalized extraction
        await ctx.db.insert("extractionsNorm", {
          documentId: document._id,
          fieldId: extraction.fieldId,
          value: normalized.value,
          unit: normalized.unit,
          note: normalized.note,
          flags,
          provenanceRef: `${document._id}:${extraction.source.page}:${extraction.source.method}`,
          confidence: Math.min(extraction.confidence, validation.isValid ? 1.0 : 0.5),
          createdAt: now(),
        });
      }
    }

    await ctx.runMutation(api.jobs.updateJobStatus, {
      jobId: args.jobId,
      status: "NORMALIZED",
    });
  },
});

// STEP 5: Build Results (normalized fields → comparison table)
export const buildJobResults = action({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, args) => {
    const job = await ctx.runQuery(api.jobs.getJob, { jobId: args.jobId });
    if (!job || !job.domain) {
      throw new Error("Job domain not classified yet");
    }

    const documents = await ctx.db
      .query("documents")
      .withIndex("by_job", (q) => q.eq("jobId", args.jobId))
      .collect();

    const domainProfile = getDomainProfile(job.domain as any);

    // Get all normalized extractions for all documents
    const allExtractions = new Map<string, Map<string, any>>(); // fieldId -> documentId -> extraction
    
    for (const document of documents) {
      const extractions = await ctx.db
        .query("extractionsNorm")
        .withIndex("by_document", (q) => q.eq("documentId", document._id))
        .collect();

      for (const extraction of extractions) {
        if (!allExtractions.has(extraction.fieldId)) {
          allExtractions.set(extraction.fieldId, new Map());
        }
        allExtractions.get(extraction.fieldId)!.set(document._id, extraction);
      }
    }

    // Build columns from active fields in domain profile
    const columns = domainProfile.active_fields
      .filter(field => allExtractions.has(field.field))
      .sort((a, b) => b.priority - a.priority) // Sort by priority descending
      .slice(0, 12) // Limit to top 12 fields
      .map(field => ({
        id: field.field,
        label: field.display_label,
        unit: domainProfile.unit_targets[field.field],
        better: getFieldOptimality(field.field, domainProfile),
      }));

    // Build rows (one per document)
    const rows = documents.map(document => {
      const cells: Record<string, any> = {};
      
      for (const column of columns) {
        const extraction = allExtractions.get(column.id)?.get(document._id);
        
        if (extraction) {
          cells[column.id] = {
            value: extraction.value,
            unit: extraction.unit,
            confidence: extraction.confidence,
            provenanceRef: extraction.provenanceRef,
            flags: extraction.flags,
          };
        } else {
          cells[column.id] = {
            value: null,
            unit: null,
            confidence: 0,
            provenanceRef: "",
            flags: ["missing"],
          };
        }
      }

      return {
        documentId: document._id,
        cells,
      };
    });

    // Calculate highlights (best/worst values per column)
    const highlights = calculateHighlights(columns, rows);

    // Store results
    await ctx.db.insert("results", {
      jobId: args.jobId,
      columns,
      rows,
      highlights,
      exports: undefined, // Will be populated when user exports
      createdAt: now(),
    });

    await ctx.runMutation(api.jobs.updateJobStatus, {
      jobId: args.jobId,
      status: "BUILT",
    });
  },
});

// === JOB RESULTS & EXPORT ===

export const getJobResults = query({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, args) => {
    const results = await ctx.db
      .query("results")
      .withIndex("by_job", (q) => q.eq("jobId", args.jobId))
      .first();

    if (!results) {
      // Return empty structure if no results yet
      return {
        columns: [],
        rows: [],
        highlights: [],
        exports: null,
      };
    }

    return results;
  },
});

export const exportJobResults = action({
  args: { 
    jobId: v.id("jobs"),
    format: v.string(), // "csv" | "xlsx" | "json"
  },
  handler: async (ctx, args) => {
    const results = await ctx.runQuery(api.jobs.getJobResults, { jobId: args.jobId });
    
    if (results.columns.length === 0) {
      throw new Error("No results available for export");
    }

    // Generate export data based on format
    let exportData: string;
    let contentType: string;
    let filename: string;

    switch (args.format) {
      case 'csv':
        exportData = generateCSV(results);
        contentType = 'text/csv';
        filename = `comparison-${args.jobId}.csv`;
        break;
      
      case 'xlsx':
        // For XLSX, we'll return a structured JSON that the client can convert
        exportData = JSON.stringify({
          format: 'xlsx',
          data: results,
          metadata: {
            generated: new Date().toISOString(),
            jobId: args.jobId,
          }
        });
        contentType = 'application/json';
        filename = `comparison-${args.jobId}.xlsx`;
        break;
      
      case 'json':
        exportData = JSON.stringify({
          ...results,
          metadata: {
            generated: new Date().toISOString(),
            jobId: args.jobId,
          }
        }, null, 2);
        contentType = 'application/json';
        filename = `comparison-${args.jobId}.json`;
        break;
      
      default:
        throw new Error(`Unsupported export format: ${args.format}`);
    }

    // Store the export file in storage
    const blob = new Blob([exportData], { type: contentType });
    const storageId = await ctx.storage.store(blob);
    
    // Update results with export URL
    await ctx.runMutation(api.jobs.updateResultsExports, {
      jobId: args.jobId,
      format: args.format,
      storageId,
      filename,
    });

    return await ctx.storage.getUrl(storageId);
  },
});

export const updateResultsExports = mutation({
  args: {
    jobId: v.id("jobs"),
    format: v.string(),
    storageId: v.id("_storage"),
    filename: v.string(),
  },
  handler: async (ctx, args) => {
    // Get existing results
    const results = await ctx.db
      .query("results")
      .withIndex("by_job", (q) => q.eq("jobId", args.jobId))
      .first();
      
    if (!results) {
      throw new Error("Results not found");
    }
    
    // Update exports object
    const exports = results.exports || {};
    exports[args.format as keyof typeof exports] = {
      storageId: args.storageId,
      filename: args.filename,
      createdAt: now(),
    };
    
    await ctx.db.patch(results._id, { exports });
  },
});

// === HELPER FUNCTIONS ===

/**
 * Generate CSV export from results
 */
function generateCSV(results: any): string {
  const lines: string[] = [];
  
  // Header row
  const headers = results.columns.map((col: any) => col.label || col.id);
  lines.push(headers.join(','));
  
  // Data rows - for each metric, create a row
  for (let i = 0; i < results.columns.length; i++) {
    const column = results.columns[i];
    const row = [column.label];
    
    // Add values from each document
    for (const docRow of results.rows) {
      const cell = docRow.cells[column.id];
      let value = '';
      
      if (cell && cell.value !== null) {
        if (cell.unit && cell.unit !== 'boolean') {
          value = `${cell.value} ${cell.unit}`;
        } else {
          value = String(cell.value);
        }
      }
      
      // Escape commas and quotes
      if (value.includes(',') || value.includes('"')) {
        value = `"${value.replace(/"/g, '""')}"`;
      }
      
      row.push(value);
    }
    
    lines.push(row.join(','));
  }
  
  return lines.join('\n');
}

/**
 * Normalize a value according to domain profile rules
 */
function normalizeValueWithProfile(
  rawValue: string,
  rawUnit: string | undefined,
  fieldId: string,
  profile: any
): {
  value: string | number | boolean | null;
  unit?: string;
  note?: string;
  wasConverted: boolean;
} {
  let value: any = rawValue;
  let unit = rawUnit;
  let note: string | undefined;
  let wasConverted = false;

  // Get target unit for this field
  const targetUnit = profile.unit_targets[fieldId];

  // Handle numeric values with unit conversion
  const numMatch = rawValue.match(/^[\$€£]?(\d+(?:[,.]\d+)?)\s*([a-zA-Z/%]+)?$/);
  if (numMatch) {
    value = parseFloat(numMatch[1].replace(/,/g, ""));
    const originalUnit = numMatch[2]?.toLowerCase() || rawUnit?.toLowerCase();

    // Currency handling
    if (rawValue.startsWith('$')) {
      unit = 'USD';
    } else if (rawValue.startsWith('€')) {
      unit = 'EUR';
    } else if (rawValue.startsWith('£')) {
      unit = 'GBP';
    } else if (originalUnit) {
      unit = originalUnit;
    }

    // Unit conversion based on target
    if (targetUnit && originalUnit && targetUnit !== originalUnit) {
      const converted = convertUnit(value, originalUnit, targetUnit);
      if (converted !== null) {
        value = converted;
        unit = targetUnit;
        note = `Converted from ${rawValue}`;
        wasConverted = true;
      }
    }
  }

  // Handle boolean values
  const truthy = ["yes", "true", "supported", "available", "enabled", "✓"];
  const falsy = ["no", "false", "not supported", "unavailable", "disabled", "✗", "—", "-"];
  
  if (truthy.some(t => rawValue.toLowerCase().includes(t))) {
    value = true;
    unit = undefined;
  } else if (falsy.some(f => rawValue.toLowerCase().includes(f))) {
    value = false;
    unit = undefined;
  }

  // Handle percentage values
  if (rawValue.includes('%')) {
    const percentMatch = rawValue.match(/(\d+(?:\.\d+)?)/);
    if (percentMatch) {
      value = parseFloat(percentMatch[1]);
      unit = 'percent';
    }
  }

  return { value, unit, note, wasConverted };
}

/**
 * Convert between units where possible
 */
function convertUnit(value: number, fromUnit: string, toUnit: string): number | null {
  const from = fromUnit.toLowerCase();
  const to = toUnit.toLowerCase();

  // Time conversions
  if (from === 's' && to === 'ms') return value * 1000;
  if (from === 'ms' && to === 's') return value / 1000;
  if (from === 'us' && to === 'ms') return value / 1000;
  if (from === 'ns' && to === 'ms') return value / 1000000;

  // Frequency conversions  
  if (from === 'hz' && to === 'mhz') return value / 1000000;
  if (from === 'khz' && to === 'mhz') return value / 1000;
  if (from === 'mhz' && to === 'ghz') return value / 1000;
  if (from === 'ghz' && to === 'mhz') return value * 1000;

  // Power conversions
  if (from === 'w' && to === 'mw') return value * 1000;
  if (from === 'mw' && to === 'w') return value / 1000;
  if (from === 'kw' && to === 'w') return value * 1000;

  // Current conversions
  if (from === 'a' && to === 'ma') return value * 1000;
  if (from === 'ma' && to === 'a') return value / 1000;
  if (from === 'ua' && to === 'ma') return value / 1000;

  // Data rate conversions
  if (from === 'kbps' && to === 'mbps') return value / 1000;
  if (from === 'mbps' && to === 'gbps') return value / 1000;
  if (from === 'gbps' && to === 'mbps') return value * 1000;

  return null; // No conversion available
}

/**
 * Get field optimality from domain profile
 */
function getFieldOptimality(fieldId: string, profile: any): "up" | "down" | undefined {
  // Check UNIVERSAL_SCHEMA optimality first
  const { UNIVERSAL_SCHEMA } = require("./domain_schema");
  for (const [sectionName, section] of Object.entries(UNIVERSAL_SCHEMA)) {
    if (typeof section === 'object' && section !== null) {
      const field = (section as any)[fieldId];
      if (field?.optimality === "max") return "up";
      if (field?.optimality === "min") return "down";
    }
  }

  // Fallback heuristics based on field name
  const lowerFieldId = fieldId.toLowerCase();
  
  // Fields where higher is better
  if (lowerFieldId.includes('efficiency') ||
      lowerFieldId.includes('uptime') ||
      lowerFieldId.includes('throughput') ||
      lowerFieldId.includes('accuracy') ||
      lowerFieldId.includes('frequency') ||
      lowerFieldId.includes('sla')) {
    return "up";
  }

  // Fields where lower is better  
  if (lowerFieldId.includes('latency') ||
      lowerFieldId.includes('power') ||
      lowerFieldId.includes('cost') ||
      lowerFieldId.includes('price') ||
      lowerFieldId.includes('error') ||
      lowerFieldId.includes('noise')) {
    return "down";
  }

  return undefined;
}

/**
 * Calculate highlights (best/worst) for comparison table
 */
function calculateHighlights(columns: any[], rows: any[]): any[] {
  const highlights: any[] = [];

  for (const column of columns) {
    const values = rows
      .map(row => ({
        documentId: row.documentId,
        cell: row.cells[column.id],
      }))
      .filter(item => 
        item.cell && 
        item.cell.value !== null && 
        typeof item.cell.value === 'number' &&
        !item.cell.flags.includes('missing')
      );

    if (values.length < 2) continue; // Need at least 2 values to compare

    const numericValues = values.map(item => ({
      documentId: item.documentId,
      value: item.cell.value as number,
    }));

    // Find best and worst based on column optimality
    let best, worst;
    
    if (column.better === "up") {
      // Higher is better
      best = numericValues.reduce((a, b) => a.value > b.value ? a : b);
      worst = numericValues.reduce((a, b) => a.value < b.value ? a : b);
    } else if (column.better === "down") {
      // Lower is better  
      best = numericValues.reduce((a, b) => a.value < b.value ? a : b);
      worst = numericValues.reduce((a, b) => a.value > b.value ? a : b);
    } else {
      // No optimization preference
      continue;
    }

    if (best && worst && best.documentId !== worst.documentId) {
      highlights.push({
        columnId: column.id,
        type: "best",
        documentId: best.documentId,
        value: best.value,
      });
      
      highlights.push({
        columnId: column.id,
        type: "worst", 
        documentId: worst.documentId,
        value: worst.value,
      });
    }
  }

  return highlights;
}