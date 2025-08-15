/**
 * Schema Universale B2B - Base per tutti i domini
 * Ogni profilo di dominio decide quali sezioni/campi attivare
 * Segue applogic.md sezione 2
 */

import { v } from "convex/values";

// Tipi di campo supportati (applogic.md sezione 3)
export const FIELD_TYPES = {
  QUANTITY: "quantity",        // numero + unità: "44 mA", "500 MB/s"  
  RANGE: "range",             // min/typ/max + condizioni: "10–20 MB/s @25°C"
  ENUM: "enum",               // valori canonizzati: Auth: {API Key, OAuth 2.0, mTLS}
  BOOLEAN: "boolean",         // con evidenza: "FIPS 140-2: sì"
  TEXT: "text",               // url, modello, chipset
  MATRIX: "matrix",           // piani prezzo, "features vs tier"
  CURVE: "curve"              // grafici → opzionale
} as const;

export type FieldType = typeof FIELD_TYPES[keyof typeof FIELD_TYPES];

// Struttura di un campo estratto con provenienza completa
export const ExtractedFieldSchema = v.object({
  // Valore normalizzato
  normalized_value: v.union(v.string(), v.number(), v.boolean(), v.array(v.any()), v.null()),
  
  // Valore originale dal documento
  raw_value: v.string(),
  
  // Tipo di campo
  field_type: v.string(),
  
  // Unità (se applicabile)
  unit: v.optional(v.string()),
  unit_original: v.optional(v.string()),
  
  // Provenienza (applogic.md sezione 8)
  source: v.object({
    document_page: v.number(),
    extraction_method: v.string(),  // "tabula", "ocr", "text", "calculated"
    source_section: v.optional(v.string()), // "Electrical Characteristics", "Pricing", etc
    bounding_box: v.optional(v.object({
      x: v.number(),
      y: v.number(), 
      width: v.number(),
      height: v.number()
    })),
    table_ref: v.optional(v.object({
      table_id: v.string(),
      row: v.number(),
      column: v.number()
    }))
  }),
  
  // Confidenza e validazione
  confidence: v.number(),          // 0-1
  validation_status: v.string(),   // "valid", "needs_review", "invalid"
  validation_notes: v.optional(v.string()),
  
  // Note di conversione/calcolo
  conversion_notes: v.optional(v.string()),
  
  // Per conflitti
  alternative_values: v.optional(v.array(v.object({
    value: v.union(v.string(), v.number(), v.boolean()),
    confidence: v.number(),
    source_ref: v.string()
  })))
});

// Schema Universale - 6 sezioni principali (applogic.md sezione 2)
export const UNIVERSAL_SCHEMA = {
  // 1. Identità & compatibilità
  identity: {
    product_model: { type: FIELD_TYPES.TEXT, priority: 10 },
    version_fw: { type: FIELD_TYPES.TEXT, priority: 9 },
    form_factor: { type: FIELD_TYPES.ENUM, priority: 8 },
    interfaces: { type: FIELD_TYPES.ENUM, priority: 7 },
    dependencies: { type: FIELD_TYPES.TEXT, priority: 6 },
    ecosystem_sdk: { type: FIELD_TYPES.TEXT, priority: 5 }
  },
  
  // 2. Capacità & performance  
  performance: {
    throughput: { type: FIELD_TYPES.QUANTITY, priority: 10, unit_target: "req/s" },
    iops: { type: FIELD_TYPES.QUANTITY, priority: 9, unit_target: "iops" },
    latency_p50: { type: FIELD_TYPES.QUANTITY, priority: 10, unit_target: "ms", optimality: "min" },
    latency_p95: { type: FIELD_TYPES.QUANTITY, priority: 9, unit_target: "ms", optimality: "min" },
    frequency_compute: { type: FIELD_TYPES.QUANTITY, priority: 8, unit_target: "MHz" },
    operating_range: { type: FIELD_TYPES.RANGE, priority: 7 },
    accuracy: { type: FIELD_TYPES.QUANTITY, priority: 6, unit_target: "percent" }
  },
  
  // 3. Consumi & ambiente
  environment: {
    power_idle: { type: FIELD_TYPES.QUANTITY, priority: 8, unit_target: "W" },
    power_typical: { type: FIELD_TYPES.QUANTITY, priority: 9, unit_target: "W" },
    power_max: { type: FIELD_TYPES.QUANTITY, priority: 10, unit_target: "W", optimality: "min" },
    efficiency: { type: FIELD_TYPES.QUANTITY, priority: 9, unit_target: "percent", optimality: "max" },
    temperature_range: { type: FIELD_TYPES.RANGE, priority: 8, unit_target: "°C" },
    ip_rating: { type: FIELD_TYPES.TEXT, priority: 6 },
    mtbf: { type: FIELD_TYPES.QUANTITY, priority: 7, unit_target: "hours" }
  },
  
  // 4. Affidabilità & sicurezza
  reliability: {
    sla_uptime: { type: FIELD_TYPES.QUANTITY, priority: 10, unit_target: "percent", optimality: "max" },
    ha_failover: { type: FIELD_TYPES.BOOLEAN, priority: 9 },
    encryption: { type: FIELD_TYPES.ENUM, priority: 8 },
    cert_soc2: { type: FIELD_TYPES.BOOLEAN, priority: 9 },
    cert_iso: { type: FIELD_TYPES.BOOLEAN, priority: 8 },
    cert_iec: { type: FIELD_TYPES.BOOLEAN, priority: 7 },
    cert_fda: { type: FIELD_TYPES.BOOLEAN, priority: 6 },
    cert_ce: { type: FIELD_TYPES.BOOLEAN, priority: 6 }
  },
  
  // 5. Economics
  economics: {
    price_list: { type: FIELD_TYPES.QUANTITY, priority: 10, unit_target: "USD" },
    price_tier: { type: FIELD_TYPES.MATRIX, priority: 9 },
    licensing: { type: FIELD_TYPES.TEXT, priority: 7 },
    tco_declared: { type: FIELD_TYPES.QUANTITY, priority: 6, unit_target: "USD" },
    quota_limits: { type: FIELD_TYPES.QUANTITY, priority: 8 },
    rate_limits: { type: FIELD_TYPES.QUANTITY, priority: 8, unit_target: "req/s" }
  },
  
  // 6. Operatività
  operations: {
    deployment: { type: FIELD_TYPES.ENUM, priority: 9 }, // on-prem/edge/cloud
    regions_pop: { type: FIELD_TYPES.TEXT, priority: 7 },
    support_slo: { type: FIELD_TYPES.QUANTITY, priority: 8, unit_target: "hours", optimality: "min" },
    maintainability: { type: FIELD_TYPES.ENUM, priority: 6 }
  }
} as const;

// Domini supportati (applogic.md sezione 1)
export const SUPPORTED_DOMAINS = {
  SEMICONDUCTORS: "semiconductors",
  NETWORKING: "networking", 
  COMPUTE_STORAGE: "compute_storage",
  ENERGY: "energy",
  INDUSTRIAL: "industrial",
  MEDICAL: "medical",
  SOFTWARE_B2B: "software_b2b",
  API_SDK: "api_sdk",
  SECURITY: "security",
  TELCO_EDGE: "telco_edge"
} as const;

export type Domain = typeof SUPPORTED_DOMAINS[keyof typeof SUPPORTED_DOMAINS];

// Schema per documento classificato
export const ClassifiedDocumentSchema = v.object({
  document_id: v.id("documents"),
  classified_domain: v.string(),
  classification_confidence: v.number(),
  classification_method: v.string(),
  alternative_domains: v.optional(v.array(v.object({
    domain: v.string(),
    confidence: v.number()
  }))),
  requires_user_confirmation: v.boolean(),
  profile_version: v.string(),
  created_at: v.number()
});

// Schema per dati estratti con schema universale
export const UniversalExtractionSchema = v.object({
  document_id: v.id("documents"),
  domain: v.string(),
  profile_version: v.string(),
  
  // Dati organizzati per sezione
  identity: v.optional(v.record(v.string(), ExtractedFieldSchema)),
  performance: v.optional(v.record(v.string(), ExtractedFieldSchema)),
  environment: v.optional(v.record(v.string(), ExtractedFieldSchema)),
  reliability: v.optional(v.record(v.string(), ExtractedFieldSchema)),
  economics: v.optional(v.record(v.string(), ExtractedFieldSchema)),
  operations: v.optional(v.record(v.string(), ExtractedFieldSchema)),
  
  // Metadati estrazione
  extraction_quality: v.number(),
  total_fields_found: v.number(),
  fields_needing_review: v.number(),
  extraction_timestamp: v.number(),
  
  // Riproducibilità
  document_hash: v.string(),
  profile_hash: v.string()
});