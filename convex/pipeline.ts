import { action, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { extractMetricCandidates } from "./langchain_parser";
import { classifyDomain, combineClassifications, classifyFromFilename } from "./domain_classifier";
import { getDomainProfile } from "./domain_profiles";
import { UNIVERSAL_SCHEMA } from "./domain_schema";

// Types
type PdfSpec = { uri: string; vendor_hint?: string | null };

// Helpers
const now = () => Date.now();

// Chunking functions to respect Convex size limits
function chunkTextBlocks(textBlocks: any[], maxSizeBytes: number): any[] {
  if (!textBlocks || textBlocks.length === 0) return [];
  
  const chunks: any[] = [];
  let currentChunk: any[] = [];
  let currentSize = 0;
  
  for (const block of textBlocks) {
    const blockSize = JSON.stringify(block).length;
    
    // If single block is too large, truncate it
    if (blockSize > maxSizeBytes) {
      const truncatedBlock = {
        ...block,
        text: block.text?.substring(0, Math.floor(maxSizeBytes / 2)) + '...[truncated]'
      };
      chunks.push([truncatedBlock]);
      continue;
    }
    
    // If adding this block would exceed limit, start new chunk
    if (currentSize + blockSize > maxSizeBytes && currentChunk.length > 0) {
      chunks.push([...currentChunk]);
      currentChunk = [block];
      currentSize = blockSize;
    } else {
      currentChunk.push(block);
      currentSize += blockSize;
    }
  }
  
  // Add final chunk if not empty
  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }
  
  // Flatten chunks for compatibility
  return chunks.flat();
}

function chunkTables(tables: any[], maxSizeBytes: number): any[] {
  if (!tables || tables.length === 0) return [];
  
  const chunks: any[] = [];
  
  for (const table of tables) {
    const tableSize = JSON.stringify(table).length;
    
    // If table is too large, limit its rows
    if (tableSize > maxSizeBytes) {
      const maxRows = Math.floor((table.rows?.length || 0) * 0.3); // Keep 30% of rows
      const truncatedTable = {
        ...table,
        rows: (table.rows || []).slice(0, maxRows),
        truncated: true,
        originalRowCount: table.rows?.length || 0
      };
      chunks.push(truncatedTable);
    } else {
      chunks.push(table);
    }
  }
  
  return chunks;
}

async function processPdfViaOcrWorker(ctx: any, storageId: string): Promise<{ tables: any[]; textBlocks: Array<{ id: number; text: string }>; pages?: number }> {
  try {
    console.log("DEBUG: Processing PDF via OCR Worker (Tabula + OCR pipeline)");
    
    // Get PDF URL from Convex storage
    const pdfUrl = await ctx.storage.getUrl(storageId);
    if (!pdfUrl) {
      throw new Error("Could not get PDF URL from storage");
    }
    
    console.log("DEBUG: PDF URL obtained, calling OCR Worker");
    
    // Call OCR Worker with proper B2B pipeline
    const ocrWorkerUrl = process.env.OCR_WORKER_URL || process.env.PROCESSOR_SERVICE_URL;
    if (!ocrWorkerUrl) {
      throw new Error("OCR_WORKER_URL not configured");
    }
    
    // Aggiungi timeout e retry logic
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 secondi timeout
    
    try {
      const response = await fetch(`${ocrWorkerUrl.replace(/\/$/, '')}/process-pdf`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          pdf_url: pdfUrl
        }),
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`OCR Worker HTTP error: ${response.status} - ${errorText}`);
      
      // Gestione specifica per errori comuni
      if (response.status === 503) {
        throw new Error(`OCR Worker service temporarily unavailable (503). Please check if the OCR Worker is deployed and running.`);
      } else if (response.status === 404) {
        throw new Error(`OCR Worker endpoint not found (404). Please verify the OCR_WORKER_URL configuration.`);
      } else if (response.status >= 500) {
        throw new Error(`OCR Worker internal error (${response.status}). Service may be experiencing issues.`);
      } else {
        throw new Error(`OCR Worker failed: ${response.status} - ${errorText}`);
      }
    }
    
      const result = await response.json();
      console.log("DEBUG: OCR Worker success - Tables:", result.tables?.length, "Text blocks:", result.text_blocks?.length);
      
      return {
        tables: result.tables || [],
        textBlocks: (result.text_blocks || []).map((t: any, idx: number) => ({ 
          id: idx, 
          text: String(t.text || '').slice(0, 4000),  // Increased for B2B docs
          page: t.page || idx + 1
        })),
        pages: result.pages || 1,
      };
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      
      if (fetchError.name === 'AbortError') {
        throw new Error('OCR Worker request timed out after 30 seconds. The service may be overloaded or experiencing issues.');
      }
      
      throw fetchError;
    }
    
  } catch (error: any) {
    console.error("DEBUG: OCR Worker processing failed:", error?.message || error);
    
    // Enhanced fallback with better error information
    const errorMessage = error?.message || 'Unknown error';
    console.error("DEBUG: Full error details:", error);
    
    // Log specifico per errori di connettività
    if (errorMessage.includes('503') || errorMessage.includes('unavailable')) {
      console.error("OCR Worker service appears to be down. Check deployment status.");
    }
    
    // Fallback più robusto che permette di continuare l'elaborazione
    return { 
      tables: [], 
      textBlocks: [{ 
        id: 0, 
        text: `PDF processing temporarily unavailable. Error: ${errorMessage}. The system will continue with basic text extraction. Please check OCR Worker deployment status.`
      }], 
      pages: 1 
    };
  }
}

// Legacy function - deprecated in favor of processPdfDirect
async function processPdfViaProcessor(uri: string): Promise<{ tables: any[]; textBlocks: Array<{ id: number; text: string }>; pages?: number }> {
  console.log("WARNING: Legacy processPdfViaProcessor called - this function is deprecated");
  console.log("Returning minimal fallback extraction");
  
  return {
    tables: [],
    textBlocks: [{ id: 0, text: "Legacy Railway processor has been deprecated. Using direct Convex processing instead." }],
    pages: 1
  };
}

function extractLabelValuePairs(text: string): Array<{ label: string; value: string; confidence: number; sourceContext: string }> {
  const pairs: Array<{ label: string; value: string; confidence: number; sourceContext: string }> = [];
  const lines = text.split(/\r?\n/);
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const context = lines.slice(Math.max(0, i-1), Math.min(lines.length, i+2)).join(' ');
    
    // Pattern 1: Label: Value (standard colon-separated)
    let match = line.match(/^\s*([^:]{2,50})\s*:\s*(.+)$/);
    if (match) {
      const label = match[1].trim();
      const value = match[2].trim();
      if (label && value && value !== '-' && value !== '—') {
        pairs.push({ label, value, confidence: 0.9, sourceContext: context });
      }
    }
    
    // Pattern 2: Key-value in table format (e.g., "Monthly Price    $99")
    match = line.match(/^\s*([A-Za-z][^\$0-9]{5,40})\s{2,}([\$]?\d+[.,]?\d*\s*[A-Za-z%]*)\s*$/);
    if (match) {
      const label = match[1].trim();
      const value = match[2].trim();
      pairs.push({ label, value, confidence: 0.8, sourceContext: context });
    }
    
    // Pattern 3: Boolean-like patterns ("Feature X: Yes/No", "Feature Y supported")
    match = line.match(/^\s*([A-Za-z][^:]{5,40})\s*:\s*(yes|no|true|false|supported|not supported|available|unavailable)\s*$/i);
    if (match) {
      const label = match[1].trim();
      const value = match[2].trim();
      pairs.push({ label, value, confidence: 0.85, sourceContext: context });
    }
    
    // Pattern 4: Numeric with units (e.g., "Latency 50ms", "Throughput: 1000 req/s")
    match = line.match(/^\s*([A-Za-z][^0-9]{5,40})\s*:?\s*(\d+[.,]?\d*\s*[a-zA-Z/%]+)\s*$/);
    if (match) {
      const label = match[1].trim();
      const value = match[2].trim();
      pairs.push({ label, value, confidence: 0.9, sourceContext: context });
    }
    
    // Pattern 5: List-like values (e.g., "Languages: Java, Python, Go")
    match = line.match(/^\s*([A-Za-z][^:]{5,40})\s*:\s*([A-Za-z][^:]{10,100})\s*$/);
    if (match && match[2].includes(',')) {
      const label = match[1].trim();
      const value = match[2].trim();
      pairs.push({ label, value, confidence: 0.7, sourceContext: context });
    }
  }
  
  // Deduplicate by label (keep highest confidence)
  const deduped = new Map<string, typeof pairs[0]>();
  for (const pair of pairs) {
    const existing = deduped.get(pair.label.toLowerCase());
    if (!existing || pair.confidence > existing.confidence) {
      deduped.set(pair.label.toLowerCase(), pair);
    }
  }
  
  return Array.from(deduped.values());
}

function normalizeValueUnit(rawValue: string, unitRules?: any): { value: string | number | boolean; unit?: string; confidence: number } {
  const original = rawValue.trim();
  let confidence = 0.8;
  
  // Handle numeric values with units FIRST (before boolean check)
  // This prevents "1500" from being interpreted as boolean because it contains "1"
  const numericMatch = original.match(/^[\$]?(\d+(?:[,.]\d+)?)\s*([a-zA-Z/%]+)?$/);
  if (numericMatch) {
    let num = parseFloat(numericMatch[1].replace(/,/g, ""));
    let unit = numericMatch[2]?.toLowerCase();
    
    // Apply unit conversions if specified in unitRules
    if (unit && unitRules?.conversions) {
      const conversion = unitRules.conversions[unit];
      if (conversion) {
        num *= conversion;
        unit = unitRules.base;
        confidence = 0.95;
      }
    }
    
    // Handle percentage
    if (unit === '%' || original.includes('%')) {
      unit = 'percent';
      confidence = 0.95;
    }
    
    // Handle currency symbols
    if (original.match(/^[\$]/)) {
      unit = 'USD';
      confidence = 0.9;
    } else if (original.includes('EUR') || original.includes('euro')) {
      unit = 'EUR';
      confidence = 0.9;
    } else if (original.includes('GBP') || original.includes('pound')) {
      unit = 'GBP';
      confidence = 0.9;
    }
    
    return { value: num, unit, confidence };
  }
  
  // Handle boolean values AFTER numeric check (moved here to avoid "1" in "1500" being interpreted as boolean)
  const lowered = original.toLowerCase();
  const truthy = ["yes", "true", "supported", "available", "enabled", "included"];
  const falsy = ["no", "false", "not supported", "unavailable", "disabled", "not included", "—", "-"];
  
  // Use exact match for single digit to avoid false positives
  if (original === "1" || truthy.some(t => lowered.includes(t))) {
    return { value: true, confidence: 0.9 };
  }
  if (original === "0" || falsy.some(f => lowered.includes(f))) {
    return { value: false, confidence: 0.9 };
  }
  
  // Handle time units without numbers (e.g., "Instant", "Real-time")
  if (lowered.includes('instant') || lowered.includes('real-time') || lowered.includes('immediate')) {
    return { value: 0, unit: 'ms', confidence: 0.7 };
  }
  
  // Handle unlimited/infinite values
  if (lowered.includes('unlimited') || lowered.includes('infinite') || lowered.includes('no limit')) {
    return { value: Number.MAX_SAFE_INTEGER, confidence: 0.8 };
  }
  
  // Handle list values (count commas for rough count)
  if (original.includes(',')) {
    const count = original.split(',').length;
    return { value: count, unit: 'count', confidence: 0.6 };
  }
  
  // Fallback to string value
  return { value: original, confidence: 0.5 };
}

function pickBestValue(values: Array<any>) {
  if (values.length === 0) return null;
  if (values.length === 1) return values[0];
  
  // Sort by confidence descending, then by whether it's a table extraction (higher priority)
  return values.sort((a, b) => {
    const confA = a.confidence || 0;
    const confB = b.confidence || 0;
    const tableA = a.source_ref?.type === 'table' ? 1 : 0;
    const tableB = b.source_ref?.type === 'table' ? 1 : 0;
    
    // First by table source (tables are more reliable)
    if (tableA !== tableB) return tableB - tableA;
    // Then by confidence
    return confB - confA;
  })[0];
}

export const getActiveSynonymMapQuery = query({
  handler: async (ctx) => {
    const map = await ctx.db.query("synonymMaps").withIndex("by_active", (q) => q.eq("active", true)).first();
    return map;
  },
});

function mapLabelToCanonical(entries: any[], label: string): { metricId?: string; metricLabel?: string; optimality?: "max" | "min" } {
  if (!entries) return {};
  const lowered = label.toLowerCase().trim();
  
  // First try exact matches
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
  
  // Then try partial matches (contains)
  for (const entry of entries) {
    if (Array.isArray(entry.synonyms)) {
      for (const s of entry.synonyms) {
        const synonym = s.toLowerCase();
        if (lowered.includes(synonym) || synonym.includes(lowered)) {
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
      // === CHIP/SEMICONDUCTOR METRICS ===
      {
        canonicalMetricId: "CHIP_MODEL",
        metricLabel: "Model",
        synonyms: ["model", "product model", "part number", "device", "IC", "component", "chip model", "part", "device name", "modelo", "modello", "modèle", "型号"],
        unitRules: { base: "text" },
        priority: 10,
        optimality: undefined,
      },
      {
        canonicalMetricId: "CHIP_FREQUENCY_MAX",
        metricLabel: "Max Freq (MHz)",
        synonyms: ["max frequency", "clock frequency", "operating frequency", "frequency", "clock", "MHz", "GHz", "maximum frequency", "frecuencia máxima", "fréquence maximale", "最大频率"],
        unitRules: { base: "MHz", conversions: { "GHz": 1000, "kHz": 0.001, "Hz": 0.000001 } },
        priority: 10,
        optimality: "max",
      },
      {
        canonicalMetricId: "CHIP_POWER_TYPICAL",
        metricLabel: "Supply Current (mA)",
        synonyms: ["supply current", "quiescent current", "IQ", "operating current", "current consumption", "ICC", "IDD", "typical power", "corriente de alimentación", "courant d'alimentation", "电源电流"],
        unitRules: { base: "mA", conversions: { "µA": 0.001, "A": 1000 } },
        priority: 10,
        optimality: "min",
      },
      {
        canonicalMetricId: "CHIP_SUPPLY_VOLTAGE",
        metricLabel: "Supply Voltage (V)",
        synonyms: ["supply voltage", "VDD", "VCC", "operating voltage", "voltage range", "V", "supply", "tensión de alimentación", "tension d'alimentation", "电源电压"],
        unitRules: { base: "V", conversions: { "mV": 0.001 } },
        priority: 9,
        optimality: undefined,
      },
      {
        canonicalMetricId: "CHIP_TEMPERATURE_RANGE",
        metricLabel: "Temperature Range (°C)",
        synonyms: ["operating temperature", "temperature range", "ambient temperature", "TA", "TJ", "junction temperature", "temp range", "rango de temperatura", "plage de température", "工作温度"],
        unitRules: { base: "°C", conversions: { "K": -273.15, "°F": "(°F-32)/1.8" } },
        priority: 10,
        optimality: undefined,
      },
      {
        canonicalMetricId: "CHIP_FLASH_MEMORY",
        metricLabel: "Flash/RAM (KB)",
        synonyms: ["flash", "memory", "flash size", "RAM", "ROM", "storage", "flash memory", "program memory", "KB", "MB", "memoria flash", "mémoire flash", "闪存"],
        unitRules: { base: "KB", conversions: { "MB": 1024, "GB": 1048576, "bytes": 0.001 } },
        priority: 9,
        optimality: "max",
      },
      {
        canonicalMetricId: "CHIP_PACKAGE",
        metricLabel: "Package",
        synonyms: ["package", "package type", "form factor", "enclosure", "housing", "pin count", "empaque", "boîtier", "封装"],
        unitRules: { base: "text" },
        priority: 8,
        optimality: undefined,
      },
      
      // === API METRICS ===
      {
        canonicalMetricId: "API_BASE_URL",
        metricLabel: "Base URL",
        synonyms: ["base URL", "endpoint", "API endpoint", "service URL", "host", "domain", "URL base", "URL de base", "基础URL"],
        unitRules: { base: "text" },
        priority: 10,
        optimality: undefined,
      },
      {
        canonicalMetricId: "API_RATE_LIMIT",
        metricLabel: "Rate Limit (req/s)",
        synonyms: ["rate limit", "API limit", "throttling", "requests per second", "requests/min", "calls/hour", "límite de velocidad", "limite de débit", "请求限制"],
        unitRules: { base: "req/s", conversions: { "req/min": 0.0167, "req/hour": 0.000278 } },
        priority: 9,
        optimality: "max",
      },
      {
        canonicalMetricId: "API_LATENCY_P95",
        metricLabel: "Latency p95 (ms)",
        synonyms: ["latency", "response time", "p95", "performance", "speed", "API latency", "average response time", "latencia", "latence", "延迟"],
        unitRules: { base: "ms", conversions: { "s": 1000, "µs": 0.001 } },
        priority: 8,
        optimality: "min",
      },
      {
        canonicalMetricId: "API_AUTH_METHODS",
        metricLabel: "Authentication",
        synonyms: ["authentication", "auth", "authorization", "API key", "OAuth", "bearer token", "JWT", "autenticación", "authentification", "认证"],
        unitRules: { base: "text" },
        priority: 9,
        optimality: undefined,
      },
      
      // === GENERAL PERFORMANCE METRICS ===
      {
        canonicalMetricId: "THROUGHPUT_RPS",
        metricLabel: "Throughput (req/s)",
        synonyms: ["throughput", "req/s", "requests per second", "rps", "requests/sec", "request rate", "firewall throughput", "network throughput", "data throughput", "rendimiento", "débit", "吞吐量"],
        unitRules: { base: "rps", conversions: { "requests/sec": 1, "req/min": 0.0167, "gbps": 1000000000, "mbps": 1000000, "kbps": 1000 } },
        priority: 10,
        optimality: "max",
      },
      {
        canonicalMetricId: "LATENCY_MS",
        metricLabel: "Latency (ms)",
        synonyms: ["latency", "response time", "rt", "delay", "response latency", "network latency", "processing delay", "packet delay", "latencia", "latence", "延迟"],
        unitRules: { base: "ms", conversions: { "s": 1000, "us": 0.001 } },
        priority: 10,
        optimality: "min",
      },
      {
        canonicalMetricId: "CONCURRENT_FLAGS",
        metricLabel: "Concurrent Flags",
        synonyms: ["concurrent flags", "active flags", "flag count", "max flags", "simultaneous flags", "concurrent connections", "max connections", "connection capacity", "concurrent sessions"],
        unitRules: { base: "count" },
        priority: 9,
        optimality: "max",
      },
      {
        canonicalMetricId: "EVALUATIONS_MS",
        metricLabel: "Evaluations/ms",
        synonyms: ["evaluations per ms", "eval/ms", "flag evaluations", "evaluation rate"],
        unitRules: { base: "eval/ms" },
        priority: 8,
        optimality: "max",
      },
      {
        canonicalMetricId: "MAX_ENVIRONMENTS",
        metricLabel: "Max Environments",
        synonyms: ["environments", "max environments", "environment count", "env limit"],
        unitRules: { base: "count" },
        priority: 7,
        optimality: "max",
      },
      {
        canonicalMetricId: "DATA_RETENTION_DAYS",
        metricLabel: "Data Retention (days)",
        synonyms: ["data retention", "retention period", "log retention", "history retention"],
        unitRules: { base: "days", conversions: { "months": 30, "years": 365 } },
        priority: 6,
        optimality: "max",
      },
      // Pricing metrics
      {
        canonicalMetricId: "MONTHLY_PRICE_USD",
        metricLabel: "Monthly Price ($)",
        synonyms: ["price", "pricing", "cost", "monthly cost", "subscription price", "plan price", "precio", "prix", "价格", "monthly", "mensual", "mensuel", "月费"],
        unitRules: { base: "USD", conversions: { "EUR": 1.1, "GBP": 1.25 } },
        priority: 9,
        optimality: "min",
      },
      {
        canonicalMetricId: "SEATS_INCLUDED",
        metricLabel: "Seats Included",
        synonyms: ["seats", "users", "team members", "included seats", "user limit"],
        unitRules: { base: "count" },
        priority: 7,
        optimality: "max",
      },
      // Compliance metrics
      {
        canonicalMetricId: "UPTIME_SLA_PERCENT",
        metricLabel: "Uptime SLA (%)",
        synonyms: ["uptime", "sla", "availability", "uptime guarantee", "service level", "disponibilidad", "disponibilité", "正常运行时间", "tiempo de actividad"],
        unitRules: { base: "percent" },
        priority: 10,
        optimality: "max",
      },
      {
        canonicalMetricId: "SOC2_COMPLIANCE",
        metricLabel: "SOC2",
        synonyms: ["soc2", "soc 2", "soc2 compliant", "soc2 certified", "cumplimiento soc2", "conformité soc2", "SOC2合规"],
        unitRules: { base: "boolean" },
        priority: 8,
        optimality: "max",
      },
      {
        canonicalMetricId: "GDPR_COMPLIANCE",
        metricLabel: "GDPR",
        synonyms: ["gdpr", "gdpr compliant", "gdpr ready", "data protection"],
        unitRules: { base: "boolean" },
        priority: 8,
        optimality: "max",
      },
      {
        canonicalMetricId: "SAML_SSO",
        metricLabel: "SAML/SSO",
        synonyms: ["saml", "sso", "single sign-on", "saml sso", "identity provider"],
        unitRules: { base: "boolean" },
        priority: 7,
        optimality: "max",
      },
      {
        canonicalMetricId: "AUDIT_LOGS",
        metricLabel: "Audit Logs",
        synonyms: ["audit logs", "logging", "activity logs", "audit trail"],
        unitRules: { base: "boolean" },
        priority: 6,
        optimality: "max",
      },
      // Support metrics
      {
        canonicalMetricId: "SUPPORT_RESPONSE_HOURS",
        metricLabel: "Support Response (hrs)",
        synonyms: ["support response", "response time", "support sla", "first response"],
        unitRules: { base: "hours", conversions: { "minutes": 0.0167, "days": 24 } },
        priority: 8,
        optimality: "min",
      },
      // SDK metrics
      {
        canonicalMetricId: "SDK_LANGUAGES_COUNT",
        metricLabel: "SDKs Supported (count)",
        synonyms: ["sdks", "languages", "sdk support", "programming languages", "client libraries"],
        unitRules: { base: "count" },
        priority: 6,
        optimality: "max",
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

export const createComparisonJob = action({
  args: {
    pdf_list: v.array(
      v.object({
        uri: v.optional(v.string()),
        storageId: v.optional(v.union(v.id("_storage"), v.string())), // Allow both storage ID and string
        vendor_hint: v.optional(v.string()),
      })
    ),
    job_name: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ job_id: string; status_url: string }> => {
    // Ensure synonym map
    await ctx.runMutation(api.pipeline.seedSynonymMapV1 as any);

    const jobId: Id<"comparisonJobs"> = await ctx.runMutation(api.pipeline.insertComparisonJob, {
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
        // Try to get URL from Convex storage if storageId looks like a storage ID
        if (typeof spec.storageId === 'string' && spec.storageId.startsWith('k')) {
          try {
            const tmpUrl = await ctx.storage.getUrl(spec.storageId as any);
            resolvedUri = tmpUrl ?? undefined;
          } catch (error) {
            console.warn("Failed to resolve storageId to URL, treating as literal URI:", spec.storageId);
            resolvedUri = spec.storageId;
          }
        } else {
          // For non-storage IDs, treat as literal URI
          resolvedUri = String(spec.storageId);
        }
      }
      const docId = await ctx.runMutation(api.pipeline.insertDocument, {
        jobId: jobId as Id<"comparisonJobs">,
        vendorName: spec.vendor_hint || undefined,
        sourceUri: resolvedUri,
        storageId: spec.storageId,
        ingestedAt: now(),
        docType: undefined,
        pages: undefined,
        ocrUsed: undefined,
      });
      await ctx.runMutation(api.pipeline.insertExtractionJob, {
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

// Helper mutations for actions
export const insertComparisonJob = mutation({
  args: { name: v.optional(v.string()), status: v.string(), createdAt: v.number(), updatedAt: v.number(), progress: v.object({ total: v.number(), completed: v.number(), stage: v.string() }), synonymMapVersion: v.optional(v.string()) },
  handler: async (ctx, args) => {
    return await ctx.db.insert("comparisonJobs", args);
  },
});

export const insertDocument = mutation({
  args: { jobId: v.id("comparisonJobs"), vendorName: v.optional(v.string()), sourceUri: v.optional(v.string()), storageId: v.optional(v.id("_storage")), ingestedAt: v.number(), docType: v.optional(v.string()), pages: v.optional(v.number()), ocrUsed: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    return await ctx.db.insert("documents", args);
  },
});

export const insertExtractionJob = mutation({
  args: { jobId: v.id("comparisonJobs"), documentId: v.id("documents"), vendorName: v.optional(v.string()), status: v.string(), error: v.optional(v.string()), qualityScore: v.optional(v.number()), createdAt: v.number(), updatedAt: v.number() },
  handler: async (ctx, args) => {
    return await ctx.db.insert("extractionJobs", args);
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

export const insertDomainClassification = mutation({
  args: { 
    documentId: v.id("documents"), 
    domain: v.string(), 
    confidence: v.number(), 
    method: v.string(),
    alternativeDomains: v.array(v.object({ domain: v.string(), confidence: v.number() })),
    requiresConfirmation: v.boolean(),
    evidence: v.object({
      primaryMatches: v.array(v.string()),
      secondaryMatches: v.array(v.string()),
      sectionMatches: v.array(v.string()),
      negativeMatches: v.array(v.string())
    }),
    createdAt: v.number() 
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("domainClassifications", args);
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
    try {
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
          // Marca job di estrazione come fallito per evitare stati bloccati
          await ctx.runMutation(api.pipeline.patchExtractionJob as any, { extractionJobId: ej._id as Id<"extractionJobs">, status: "failed", updatedAt: now() });
        }
        await ctx.runMutation(api.pipeline.patchJob as any, { jobId: args.jobId, updatedAt: now(), progress: { total: extractionJobs.length, completed, stage: "extracting" } });
      }

      // Esegui aggregazione anche se nessuna metrica estratta: produrre dataset vuoto evita loop lato FE
      await ctx.runAction(api.pipeline.aggregateJob, { jobId: args.jobId });
      const finalStatus = failures > 0 && completed > 0 ? "ready_partial" : failures === extractionJobs.length ? "failed_no_signal" : "ready";
      await ctx.runMutation(api.pipeline.patchJob as any, { jobId: args.jobId, status: finalStatus, updatedAt: now() });
    } catch (e: any) {
      // Qualsiasi errore inatteso: marca il job come failed per evitare loop infiniti lato FE
      await ctx.runMutation(api.pipeline.patchJob as any, { jobId: args.jobId, status: "failed", updatedAt: now() });
      throw e;
    }
  },
});

export const processExtractionJob = action({
  args: { extractionJobId: v.id("extractionJobs") },
  handler: async (ctx, args) => {
    const ej = await ctx.runQuery(api.pipeline.getExtractionJobById, { extractionJobId: args.extractionJobId });
    if (!ej) throw new Error("Extraction job not found");
    await ctx.runMutation(api.pipeline.patchExtractionJob, { extractionJobId: args.extractionJobId, status: "extracting", updatedAt: now() });

    try {
      const document = await ctx.runQuery(api.pipeline.getDocumentById, { documentId: ej.documentId as Id<"documents"> });
      if (!document) throw new Error("Document not found");

      // Process via OCR Worker (OCR + Tabula pipeline for B2B docs)
      const storageId = (document as any).storageId;
      if (!storageId) throw new Error("Document has no storageId for processing");
      
      console.log("DEBUG: Processing B2B document with storageId:", storageId);
      const processed = await processPdfViaOcrWorker(ctx, storageId);
      const tables: any[] = processed.tables;
      const textBlocks = processed.textBlocks;

      // Chunk data to respect Convex 1MB limit - optimized for B2B documents
      const chunkedTextBlocks = chunkTextBlocks(textBlocks, 600000); // 600KB limit for larger docs
      const chunkedTables = chunkTables(tables, 200000); // 200KB limit for complex tables
      
      console.log(`DEBUG: Chunked ${textBlocks.length} blocks into ${chunkedTextBlocks.length} chunks, ${tables.length} tables into ${chunkedTables.length} chunks`);
      
      await ctx.runMutation(api.pipeline.insertRawExtraction, {
        documentId: (document as any)._id as Id<"documents">,
        tables: chunkedTables,
        textBlocks: chunkedTextBlocks,
        extractionQuality: Math.min(1, chunkedTextBlocks.length / 10),
        pageRefs: { pages: processed.pages },
        createdAt: now(),
      });

      // STEP 1: Domain Classification (implements applogic.md section 1)
      console.log("DEBUG: Starting domain classification for B2B document");
      
      const contentClassification = classifyDomain(textBlocks, tables);
      const filenameClassification = document.vendorName ? 
        classifyFromFilename(document.vendorName) : null;
      
      const finalClassification = combineClassifications(
        contentClassification, 
        filenameClassification
      );
      
      console.log("DEBUG: Domain classified as:", finalClassification.domain, 
                  "confidence:", finalClassification.confidence);
      
      // Store classification with properly formatted evidence
      await ctx.runMutation(api.pipeline.insertDomainClassification as any, {
        documentId: (document as any)._id as Id<"documents">,
        domain: finalClassification.domain,
        confidence: finalClassification.confidence,
        method: finalClassification.method,
        alternativeDomains: finalClassification.alternative_domains || [],
        requiresConfirmation: finalClassification.requires_user_confirmation,
        evidence: {
          primaryMatches: finalClassification.evidence.primaryMatches || [],
          secondaryMatches: finalClassification.evidence.secondaryMatches || [],
          sectionMatches: finalClassification.evidence.sectionMatches || [],
          negativeMatches: finalClassification.evidence.negativeMatches || []
        },
        createdAt: now()
      });
      
      // STEP 2: Domain-Aware LangChain extraction (implements applogic.md section 4)
      const openaiApiKey = process.env.OPENAI_API_KEY;
      const domainProfile = getDomainProfile(finalClassification.domain);
      
      console.log("DEBUG: Using profile version:", domainProfile.version, "for domain:", domainProfile.domain);
      
      const metricCandidates = await extractMetricCandidates(
        textBlocks, 
        tables, 
        openaiApiKey,
        domainProfile  // Pass domain profile to LangChain
      );

      // Normalization
      const synonymMap = await ctx.runQuery(api.pipeline.getActiveSynonymMapQuery);
      const metrics: any[] = [];
      for (const candidate of metricCandidates) {
        const mapping = mapLabelToCanonical(synonymMap?.entries || [], candidate.label);
        if (!mapping.metricId) {
          if (candidate.confidence >= 0.75) {
            await ctx.runMutation(api.pipeline.proposeSynonym as any, {
              label_raw: candidate.label,
              context: candidate.sourceContext,
              suggested_metric_id: undefined,
              confidence: candidate.confidence,
            });
          }
          continue;
        }
        const synonymEntry = synonymMap?.entries?.find(e => e.canonicalMetricId === mapping.metricId);
        const valueWithUnit = candidate.unit ? `${candidate.value} ${candidate.unit}` : String(candidate.value);
        const norm = normalizeValueUnit(valueWithUnit, synonymEntry?.unitRules);
        metrics.push({
          metricId: mapping.metricId,
          metricLabel: mapping.metricLabel,
          value_normalized: norm.value,
          unit_normalized: candidate.unit || norm.unit,
          confidence: Math.min(candidate.confidence, norm.confidence),
          source_ref: { type: "text", sample: String(candidate.value).slice(0, 120), context: candidate.sourceContext.slice(0, 200), originalLabel: candidate.label, pageRef: candidate.pageRef },
          normalization_version: synonymMap?.version,
        });
      }

      await ctx.runMutation(api.pipeline.insertNormalizedMetricsMutation, {
        documentId: (document as any)._id as Id<"documents">,
        metrics,
        createdAt: now(),
      });

      await ctx.runMutation(api.pipeline.patchExtractionJob, { extractionJobId: args.extractionJobId, status: "normalized", updatedAt: now(), qualityScore: Math.min(1, metrics.length / 15) });
    } catch (e: any) {
      await ctx.runMutation(api.pipeline.patchExtractionJob, { extractionJobId: args.extractionJobId, status: "failed", updatedAt: now() });
      throw e;
    }
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
      metricSet.set(entry.canonicalMetricId, { 
        metricLabel: entry.metricLabel, 
        optimality: entry.optimality as "max" | "min" | undefined
      });
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
        const bestValue = values.length ? pickBestValue(values) : null;
        matrix[metric.metricId][String(d._id)] = bestValue ? {
          value_normalized: bestValue.value_normalized,
          unit_normalized: bestValue.unit_normalized,
          confidence: bestValue.confidence,
          source_ref: bestValue.source_ref,
        } : null;
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
    // Se non esiste ancora il dataset, restituiamo struttura vuota coerente con PRD per evitare errori FE
    if (!artifact?.data) {
      return {
        vendors: [],
        metrics: [],
        matrix: {},
        deltas: {},
        best_vendor_by_metric: {},
        missing_flags: {},
        synonym_map_version: undefined,
      };
    }
    return artifact.data;
  },
});

export const getLatestJobs = query({
  handler: async (ctx) => {
    const jobs = await ctx.db.query("comparisonJobs").order("desc").take(5);
    const jobsWithDetails = [];
    for (const job of jobs) {
      const docs = await ctx.db.query("documents").withIndex("by_job", q => q.eq("jobId", job._id)).collect();
      const extractions = await ctx.db.query("extractionJobs").withIndex("by_job", q => q.eq("jobId", job._id)).collect();
      const artifacts = await ctx.db.query("comparisonArtifacts").withIndex("by_job", q => q.eq("jobId", job._id)).collect();
      jobsWithDetails.push({
        job,
        documentsCount: docs.length,
        extractionsCount: extractions.length,
        artifactsCount: artifacts.length,
        extractionStatuses: extractions.map(e => ({ id: e._id, status: e.status, error: e.error })),
      });
    }
    return jobsWithDetails;
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


