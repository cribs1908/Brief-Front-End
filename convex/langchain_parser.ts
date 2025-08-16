/**
 * LangChain-based Semantic Parser with Schema-First Prompts
 * Implements PRD requirements for structured extraction with few-shot examples
 * Uses domain profiles for targeted, schema-first extraction
 */

import { ChatOpenAI } from "@langchain/openai";
import { PromptTemplate } from "@langchain/core/prompts";
import { StructuredOutputParser } from "langchain/output_parsers";
import { z } from "zod";
import type { DomainProfile } from "./domain_profiles";
import { applyExtractionRules } from "./extraction_rules";
import { normalizeMetrics } from "./unit_converter";

// Schema for extracted metrics
const MetricCandidateSchema = z.object({
  label: z.string().describe("The raw label/key for the metric"),
  value: z.union([z.string(), z.number(), z.boolean()]).describe("The extracted value"),
  unit: z.string().optional().describe("Unit of measurement if applicable"),
  confidence: z.number().min(0).max(1).describe("Confidence score for this extraction"),
  sourceContext: z.string().describe("Original text context where this was found"),
  pageRef: z.number().optional().describe("Page number where found"),
});

export type MetricCandidate = z.infer<typeof MetricCandidateSchema>;

// Schema for array of metrics
const MetricCandidatesArraySchema = z.array(MetricCandidateSchema);

// Create structured output parser
const outputParser = StructuredOutputParser.fromZodSchema(MetricCandidatesArraySchema);

/**
 * Generate schema-first prompt based on domain profile
 * Implements PRD requirement for schema-first extraction
 */
function generateSchemaPrompt(domainProfile: DomainProfile): string {
  const requiredFields = domainProfile.active_fields
    .filter(field => field.required)
    .map(field => `- ${field.display_label} (${field.field}): Priority ${field.priority}`)
    .join('\n');
    
  const optionalFields = domainProfile.active_fields
    .filter(field => !field.required)
    .map(field => `- ${field.display_label} (${field.field}): Priority ${field.priority}`)
    .join('\n');
    
  const prioritySections = domainProfile.priority_sections
    .map((section, index) => `${index + 1}. ${section}`)
    .join('\n');

  return `
DOMAIN: ${domainProfile.domain.toUpperCase()} (Version ${domainProfile.version})

REQUIRED FIELDS (Extract these with high priority):
${requiredFields}

OPTIONAL FIELDS (Extract if found):
${optionalFields}

PRIORITY SECTIONS TO SEARCH (in order):
${prioritySections}

UNIT TARGETS:
${Object.entries(domainProfile.unit_targets).map(([field, unit]) => `- ${field}: ${unit}`).join('\n')}

FIELD SYNONYMS:
${Object.entries(domainProfile.field_synonyms).map(([field, synonyms]) => 
  `- ${field}: ${synonyms.slice(0, 5).join(', ')}${synonyms.length > 5 ? '...' : ''}`
).join('\n')}
`;
}

/**
 * Generate few-shot examples based on domain
 */
function getFewShotExamples(domain: string): string {
  switch (domain) {
    case 'semiconductors':
      return `
EXAMPLE 1 - CHIP DATASHEET:
Input: "The TPS546B25 operates at 3.3V ± 5% with maximum supply current of 15mA at 25°C ambient temperature. Package: HTSSOP-14"
Output: [
  {"label": "product_model", "value": "TPS546B25", "unit": null, "confidence": 0.95, "sourceContext": "The TPS546B25 operates..."},
  {"label": "supply_voltage", "value": 3.3, "unit": "V", "confidence": 0.9, "sourceContext": "operates at 3.3V ± 5%"},
  {"label": "power_max", "value": 15, "unit": "mA", "confidence": 0.88, "sourceContext": "maximum supply current of 15mA"},
  {"label": "temperature_range", "value": "25", "unit": "°C", "confidence": 0.85, "sourceContext": "at 25°C ambient temperature"},
  {"label": "form_factor", "value": "HTSSOP-14", "unit": null, "confidence": 0.92, "sourceContext": "Package: HTSSOP-14"}
]

EXAMPLE 2 - CHIP SPECIFICATIONS TABLE:
Input: "Electrical Characteristics | Min | Typ | Max | Unit
Supply Voltage (VDD) | 2.7 | 3.3 | 3.6 | V
Operating Current | - | 12 | 18 | mA
Clock Frequency | 1 | 16 | 32 | MHz"
Output: [
  {"label": "supply_voltage", "value": "2.7-3.6", "unit": "V", "confidence": 0.95, "sourceContext": "Supply Voltage (VDD) | 2.7 | 3.3 | 3.6 | V"},
  {"label": "power_typical", "value": 12, "unit": "mA", "confidence": 0.92, "sourceContext": "Operating Current | - | 12 | 18 | mA"},
  {"label": "frequency_max", "value": 32, "unit": "MHz", "confidence": 0.94, "sourceContext": "Clock Frequency | 1 | 16 | 32 | MHz"}
]`;

    case 'api_sdk':
      return `
EXAMPLE 1 - API DOCUMENTATION:
Input: "Base URL: https://api.example.com/v2. Rate limit: 1000 requests per minute. Authentication via API key or OAuth 2.0. 99.9% uptime SLA."
Output: [
  {"label": "base_url", "value": "https://api.example.com/v2", "unit": null, "confidence": 0.98, "sourceContext": "Base URL: https://api.example.com/v2"},
  {"label": "rate_limit", "value": 1000, "unit": "req/min", "confidence": 0.95, "sourceContext": "Rate limit: 1000 requests per minute"},
  {"label": "auth_methods", "value": "API key, OAuth 2.0", "unit": null, "confidence": 0.9, "sourceContext": "Authentication via API key or OAuth 2.0"},
  {"label": "sla_uptime", "value": 99.9, "unit": "percent", "confidence": 0.92, "sourceContext": "99.9% uptime SLA"}
]

EXAMPLE 2 - API PERFORMANCE TABLE:
Input: "Endpoint | Avg Latency | P95 Latency | Max RPS
/users | 45ms | 120ms | 500
/orders | 78ms | 200ms | 200"
Output: [
  {"label": "latency_p95", "value": 120, "unit": "ms", "confidence": 0.9, "sourceContext": "/users | 45ms | 120ms | 500"},
  {"label": "rate_limit", "value": 500, "unit": "req/s", "confidence": 0.88, "sourceContext": "Max RPS 500"}
]`;

    case 'software_b2b':
      return `
EXAMPLE 1 - SAAS PRICING:
Input: "Professional Plan: $99/month for up to 100 users. SOC2 Type II certified. 99.95% uptime guarantee."
Output: [
  {"label": "price_list", "value": 99, "unit": "USD", "confidence": 0.95, "sourceContext": "$99/month"},
  {"label": "quota_limits", "value": 100, "unit": "users", "confidence": 0.9, "sourceContext": "up to 100 users"},
  {"label": "cert_soc2", "value": true, "unit": "boolean", "confidence": 0.92, "sourceContext": "SOC2 Type II certified"},
  {"label": "sla_uptime", "value": 99.95, "unit": "percent", "confidence": 0.94, "sourceContext": "99.95% uptime guarantee"}
]`;

    default:
      return `
EXAMPLE - GENERAL:
Input: "Performance: 1000 req/s throughput, 50ms average latency. Price: $49/month."
Output: [
  {"label": "throughput", "value": 1000, "unit": "req/s", "confidence": 0.9, "sourceContext": "1000 req/s throughput"},
  {"label": "latency", "value": 50, "unit": "ms", "confidence": 0.88, "sourceContext": "50ms average latency"},
  {"label": "price", "value": 49, "unit": "USD", "confidence": 0.92, "sourceContext": "$49/month"}
]`;
  }
}

// Enhanced LangChain prompt for aggressive B2B technical document extraction
const SEMANTIC_PARSING_PROMPT = PromptTemplate.fromTemplate(`
You are an expert at extracting structured metrics from B2B technical PDF documents including:
- CHIP DATASHEETS (TPS546B25, etc): voltage, current, power, frequency, temperature ranges, efficiency
- API DOCUMENTATION: rate limits, latency, throughput, authentication methods
- SAAS SPECSHEETS: pricing, user limits, storage, compliance certifications
- NETWORK EQUIPMENT: bandwidth, concurrent users, protocols, security features

Your task is to extract ALL possible measurable metrics, specifications, and features from the provided text. Be COMPREHENSIVE and AGGRESSIVE - B2B buyers need complete data for procurement decisions.

CRITICAL INSTRUCTIONS:
1. Extract EVERYTHING that looks like a metric, specification, limit, or feature
2. Look for numbers, percentages, yes/no answers, technical capabilities, ranges (min-max)
3. Don't be conservative - if something might be a metric, include it
4. Pay special attention to tables, bullet points, and structured data
5. For missing or unclear values, still extract the metric with confidence < 0.7
6. Handle technical units properly: V, A, W, Hz, MHz, GHz, °C, Mbps, etc.

TARGET METRICS FOR DIFFERENT B2B CATEGORIES:

CHIP/SEMICONDUCTOR SPECS:
- Voltage: input/output voltage, operating range, dropout voltage
- Current: quiescent current, load current, maximum current
- Power: power dissipation, efficiency percentages, thermal resistance
- Frequency: switching frequency, bandwidth, operating frequency
- Temperature: operating temperature range, junction temperature
- Package: dimensions, pin count, package type

SOFTWARE/SAAS SPECS:
- Performance: throughput (req/s, RPS, TPS), latency (ms), response time
- Scalability: max users, environments, API calls, storage limits, bandwidth
- Pricing: monthly cost, per-user pricing, tiers, usage-based rates
- Compliance: SOC2, GDPR, HIPAA, ISO certifications, audit logs, SSO/SAML
- Support: SLA uptime %, response time, support tiers, availability
- Technical: API rate limits, data retention, backup frequency, regions

NETWORK/INFRASTRUCTURE SPECS:
- Bandwidth: throughput, data rates, channel capacity
- Users: concurrent connections, device limits, session capacity
- Protocols: supported standards, security protocols, authentication
- Management: configuration options, monitoring capabilities, alerts

EXAMPLES FOR DIFFERENT CATEGORIES:

CHIP EXAMPLES:
- "Input voltage: 4.5V to 18V" → label: "Input Voltage Range", value: "4.5V to 18V", unit: "V"
- "Efficiency: 95%" → label: "Efficiency", value: 95, unit: "percent"
- "Switching frequency: 500 kHz" → label: "Switching Frequency", value: 500, unit: "kHz"
- "Operating temperature: -40°C to +125°C" → label: "Operating Temperature Range", value: "-40°C to +125°C", unit: "°C"

SOFTWARE EXAMPLES:
- "99.9% uptime SLA" → label: "Uptime SLA", value: 99.9, unit: "percent"
- "API rate limit: 1000 calls/hour" → label: "API Rate Limit", value: 1000, unit: "calls/hour"
- "Starting at $99/month" → label: "Monthly Price", value: 99, unit: "USD"

NETWORK EXAMPLES:
- "Supports up to 10,000 concurrent users" → label: "Concurrent Users", value: 10000
- "Channel Utilization 2.4GHz: 22.16%" → label: "Channel Utilization 2.4GHz", value: 22.16, unit: "percent"

Text to analyze:
{text}

CRITICAL: Return valid JSON only. Do NOT wrap in markdown backticks. Extract as many metrics as possible for complete B2B procurement comparison data.

{format_instructions}
`);

/**
 * Create domain-aware LangChain prompt based on domain profile
 * Implements applogic.md section 4 - domain-specific extraction rules
 */
function createDomainAwarePrompt(domainProfile: any): PromptTemplate {
  if (!domainProfile) return SEMANTIC_PARSING_PROMPT;
  
  // Build domain-specific field list from profile
  const priorityFields = domainProfile.active_fields
    .sort((a: any, b: any) => b.priority - a.priority)  // Sort by priority descending
    .slice(0, 15)  // Top 15 fields to keep prompt manageable
    .map((field: any) => {
      const synonyms = domainProfile.field_synonyms[field.field] || [];
      const unitTarget = domainProfile.unit_targets[field.field];
      return `- ${field.display_label} (${field.field}): Look for ${synonyms.slice(0, 5).join(', ')}${unitTarget ? ` → ${unitTarget}` : ''}`;
    })
    .join('\n');
    
  const sectionPriorities = domainProfile.priority_sections.slice(0, 6).join(', ');
  
  // Get domain-specific few-shot examples
  const examples = getFewShotExamples(domainProfile.domain);
  
  const domainSpecificPrompt = `
You are an expert at extracting structured metrics from ${domainProfile.domain.toUpperCase()} B2B technical documents.

DOMAIN: ${domainProfile.domain.toUpperCase()} (Version ${domainProfile.version})

TARGET FIELDS (extract these with highest priority):
${priorityFields}

PRIORITY DOCUMENT SECTIONS:
Focus on: ${sectionPriorities}

DOMAIN-SPECIFIC EXAMPLES:
${examples}

EXTRACTION GUIDELINES:
1. **Field Priority**: Extract required fields first, then optional fields by priority
2. **Synonym Recognition**: Use the synonyms above to identify fields with different labels
3. **Unit Standardization**: Convert values to target units shown (e.g., mA, MHz, percent)
4. **Range Handling**: For "min/typ/max" tables, extract according to domain rules:
   ${Object.entries(domainProfile.range_rules || {}).map(([field, rule]) => 
     `   - ${field}: use ${rule} value`
   ).join('\n')}
5. **Confidence Scoring**: 
   - 0.9+ for exact matches with standard units
   - 0.8+ for synonym matches or unit conversions
   - 0.7+ for inferred values or unclear context
6. **Comprehensive Extraction**: Extract ALL measurable metrics - B2B buyers need complete specs

Text to analyze:
{text}

IMPORTANT: Return valid JSON array only. Do NOT wrap in markdown backticks or explanatory text.

{format_instructions}
`;

  return PromptTemplate.fromTemplate(domainSpecificPrompt);
}

/**
 * LangChain-powered semantic parser for extracting metrics from text
 * Implements the Information Extraction pipeline from back-end.md section 4.3
 */
export async function parseMetricsWithLangChain(
  textBlocks: Array<{ text: string; page?: number }>,
  openaiApiKey?: string,
  domainProfile?: any
): Promise<MetricCandidate[]> {
  if (!openaiApiKey) {
    console.warn("No OpenAI API key provided, falling back to basic pattern matching");
    return [];
  }

  try {
    // Initialize LangChain components
    const llm = new ChatOpenAI({
      apiKey: openaiApiKey,
      model: "gpt-4o-mini",
      temperature: 0,
      maxTokens: 1500,
      timeout: 60000,
    } as any);

    // Combine text blocks into structured input
    const combinedText = textBlocks
      .map((block, idx) => `Page ${block.page || idx + 1}:\n${block.text}`)
      .join("\n\n---\n\n");

    console.log("DEBUG: Sending to LangChain:", combinedText.substring(0, 500));

    // Create domain-aware prompt based on profile
    const domainAwarePrompt = createDomainAwarePrompt(domainProfile);
    const finalPrompt = domainProfile ? domainAwarePrompt : SEMANTIC_PARSING_PROMPT;
    
    console.log("DEBUG: Using", domainProfile ? 'domain-aware' : 'generic', "extraction prompt for domain:", domainProfile?.domain);

    // Run LangChain extraction with format instructions
    const promptContent = await finalPrompt.format({
      text: combinedText,
      format_instructions: outputParser.getFormatInstructions()
    });
    
    console.log("DEBUG: Full prompt being sent to LLM:", promptContent.substring(0, 1000), "...");
    
    const rawResponse = await llm.invoke([
      {
        type: "human" as const,
        content: promptContent
      }
    ]);

    console.log("DEBUG: Raw LangChain response:", rawResponse.content);

    // Clean markdown backticks from response for B2B robustness
    let cleanedResponse = String(rawResponse.content).trim();
    
    // Remove markdown code blocks (```json ... ```)
    if (cleanedResponse.startsWith('```')) {
      cleanedResponse = cleanedResponse
        .replace(/^```(?:json)?\s*/, '')  // Remove opening ```json
        .replace(/\s*```$/, '');         // Remove closing ```
    }
    
    console.log("DEBUG: Cleaned response:", cleanedResponse);

    // Parse manually for robustness with complex B2B specsheets
    const parsedResponse = JSON.parse(cleanedResponse);
    
    // Validate against schema and apply domain-specific confidence adjustments
    const validatedResponse = MetricCandidatesArraySchema.parse(parsedResponse);
    
    // Apply domain-specific post-processing
    const processedResponse = applyDomainPostProcessing(validatedResponse, domainProfile);
    
    console.log("DEBUG: Validated metrics count:", processedResponse.length);
    console.log("DEBUG: Sample extracted metrics:", processedResponse.slice(0, 3).map(m => `${m.label}: ${m.value} ${m.unit || ''}`));
    return processedResponse;
    
  } catch (error) {
    console.error("LangChain semantic parsing failed:", error);
    
    // For complex B2B documents, try fallback extraction
    console.log("DEBUG: Attempting fallback pattern matching for B2B specsheets");
    return [];
  }
}

/**
 * Enhanced label-value pair extraction combining LangChain and pattern matching
 * This provides a fallback approach when LangChain is not available
 */
export async function extractMetricCandidates(
  textBlocks: Array<{ text: string; page?: number }>,
  tables: Array<any> = [],
  openaiApiKey?: string,
  domainProfile?: any
): Promise<MetricCandidate[]> {
  const candidates: MetricCandidate[] = [];

  console.log("DEBUG: Starting metric extraction with:", {
    hasOpenAI: !!openaiApiKey,
    hasDomainProfile: !!domainProfile,
    domain: domainProfile?.domain,
    textBlockCount: textBlocks.length,
    tableCount: tables.length
  });

  // Apply regex/heuristic rules for easy fields before LLM processing
  if (domainProfile) {
    // Use dedicated extraction rules for high-confidence patterns
    const ruleResults = applyExtractionRules(textBlocks, domainProfile);
    candidates.push(...ruleResults);
    console.log("DEBUG: Rule-based extraction found", ruleResults.length, "candidates");
    
    // Additional heuristic patterns as backup
    const heuristicResults = extractWithDomainHeuristics(textBlocks, domainProfile);
    
    // Merge heuristics, avoiding duplicates with rule-based results
    const seenRuleLabels = new Set(ruleResults.map(r => r.label));
    const newHeuristics = heuristicResults.filter(h => !seenRuleLabels.has(h.label));
    candidates.push(...newHeuristics);
    console.log("DEBUG: Heuristic extraction added", newHeuristics.length, "additional candidates");
  }

  // Try LangChain for semantic understanding with domain awareness
  if (openaiApiKey) {
    const langchainResults = await parseMetricsWithLangChain(textBlocks, openaiApiKey, domainProfile);
    candidates.push(...langchainResults);
    console.log("DEBUG: LangChain extraction found", langchainResults.length, "candidates");
  }

  // Fallback to pattern matching for additional coverage
  const patternResults = extractWithPatterns(textBlocks);
  
  // Merge results, preferring LangChain/heuristics for duplicates
  const seenLabels = new Set(candidates.map(c => c.label.toLowerCase()));
  for (const pattern of patternResults) {
    if (!seenLabels.has(pattern.label.toLowerCase())) {
      candidates.push(pattern);
    }
  }
  console.log("DEBUG: Pattern extraction added", patternResults.filter(p => !seenLabels.has(p.label.toLowerCase())).length, "new candidates");

  // Extract from tables using structured approach
  const tableResults = extractFromTables(tables);
  candidates.push(...tableResults);
  console.log("DEBUG: Table extraction found", tableResults.length, "candidates");

  console.log("DEBUG: Total extracted candidates before normalization:", candidates.length);
  
  // Apply deterministic unit conversion and composite confidence scoring
  const normalizedCandidates = normalizeMetrics(candidates, domainProfile);
  
  console.log("DEBUG: After normalization - candidates:", normalizedCandidates.length);
  console.log("DEBUG: Top 3 confidence scores:", normalizedCandidates.slice(0, 3).map(c => `${c.label}:${c.confidence.toFixed(3)}`));
  
  return normalizedCandidates;
}

/**
 * Enhanced pattern-based extraction with aggressive B2B-focused patterns
 */
function extractWithPatterns(textBlocks: Array<{ text: string; page?: number }>): MetricCandidate[] {
  const pairs: MetricCandidate[] = [];
  
  // Debug: log what text we're receiving
  console.log("DEBUG: Received text blocks:", textBlocks.length, "blocks");
  textBlocks.forEach((block, i) => {
    console.log(`Block ${i}:`, block.text.substring(0, 200));
  });
  
  for (const block of textBlocks) {
    const lines = block.text.split('\n').filter(line => line.trim().length > 0);
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length < 3) continue; // Allow shorter matches
      
      let match;
      
      // Pattern 1: Colon-separated (e.g., "Price: $99", "Latency: 50ms")
      match = trimmed.match(/^\s*([A-Za-z][^:]{2,50})\s*:\s*(.{1,200})\s*$/);
      if (match) {
        const label = match[1].trim();
        const value = parseValue(match[2].trim());
        pairs.push({
          label,
          value: value.value,
          unit: value.unit,
          confidence: 0.8,
          sourceContext: trimmed,
          pageRef: block.page,
        });
        continue;
      }
      
      // Pattern 2: Numeric with units (e.g., "Throughput 1000 req/s", "Max users 50000")
      match = trimmed.match(/^\s*([A-Za-z][^0-9]{2,50})\s+(\d+[.,]?\d*\s*[a-zA-Z/%\-]+)\s*$/);
      if (match) {
        const label = match[1].trim();
        const value = parseValue(match[2].trim());
        pairs.push({
          label,
          value: value.value,
          unit: value.unit,
          confidence: 0.85,
          sourceContext: trimmed,
          pageRef: block.page,
        });
        continue;
      }
      
      // Pattern 3: Percentage values (e.g., "Uptime 99.9%", "SLA: 99.99%")
      match = trimmed.match(/([A-Za-z][^0-9]{2,30})\s*:?\s*(\d+(?:\.\d+)?%)/);
      if (match) {
        const label = match[1].trim();
        const value = parseFloat(match[2].replace('%', ''));
        pairs.push({
          label,
          value,
          unit: 'percent',
          confidence: 0.9,
          sourceContext: trimmed,
          pageRef: block.page,
        });
        continue;
      }
      
      // Pattern 4: Boolean/compliance patterns (e.g., "SOC2: Yes", "GDPR compliant")
      match = trimmed.match(/([A-Za-z][^:]{2,30})\s*:?\s*(Yes|No|True|False|Supported|Not supported|Available|Unavailable|Compliant|✓|✗|−)/i);
      if (match) {
        const label = match[1].trim();
        const rawValue = match[2].trim().toLowerCase();
        const value = ['yes', 'true', 'supported', 'available', 'compliant', '✓'].includes(rawValue);
        pairs.push({
          label,
          value,
          confidence: 0.9,
          sourceContext: trimmed,
          pageRef: block.page,
        });
        continue;
      }
      
      // Pattern 5: "Up to X" pattern (e.g., "Up to 10,000 users", "Supports up to 1000 environments")
      match = trimmed.match(/(Up to|Supports up to|Maximum|Max)\s+(\d+[,.]?\d*)\s*([A-Za-z\s]+)/i);
      if (match) {
        const metricName = match[3].trim();
        const value = parseFloat(match[2].replace(/,/g, ''));
        pairs.push({
          label: `Max ${metricName}`,
          value,
          confidence: 0.85,
          sourceContext: trimmed,
          pageRef: block.page,
        });
        continue;
      }
      
      // Pattern 6: Technical specifications with units (e.g., "Input voltage: 4.5V to 18V", "Frequency: 500 kHz")
      match = trimmed.match(/([A-Za-z][^:]{2,40})\s*:?\s*(\d+(?:[.,]\d+)?\s*[A-Za-z]+(?:\s*to\s*\d+(?:[.,]\d+)?\s*[A-Za-z]+)?)/);
      if (match) {
        const label = match[1].trim();
        const value = match[2].trim();
        pairs.push({
          label,
          value,
          confidence: 0.9,
          sourceContext: trimmed,
          pageRef: block.page,
        });
        continue;
      }
      
      // Pattern 7: Temperature ranges (e.g., "-40°C to +125°C", "Operating: -40 to 85°C")  
      match = trimmed.match(/([A-Za-z][^:]{2,40})\s*:?\s*(-?\d+(?:[.,]\d+)?\s*°?C?\s*to\s*[+-]?\d+(?:[.,]\d+)?\s*°C)/);
      if (match) {
        const label = match[1].trim();
        const value = match[2].trim();
        pairs.push({
          label,
          value,
          unit: '°C',
          confidence: 0.9,
          sourceContext: trimmed,
          pageRef: block.page,
        });
        continue;
      }
      
      // Pattern 8: Currency patterns (e.g., "$99/month", "€199 per user")
      match = trimmed.match(/([A-Za-z][^$€£]{2,30})\s*:?\s*([$€£]\d+[.,]?\d*)\s*([\/\s]?(month|user|year|annual)?)?/);
      if (match) {
        const label = match[1].trim();
        const currencyValue = match[2];
        const period = match[4] || '';
        const value = parseFloat(currencyValue.replace(/[$€£,]/g, ''));
        pairs.push({
          label: period ? `${label} (${period})` : label,
          value,
          unit: currencyValue[0] === '$' ? 'USD' : currencyValue[0] === '€' ? 'EUR' : 'GBP',
          confidence: 0.85,
          sourceContext: trimmed,
          pageRef: block.page,
        });
        continue;
      }
      
      // Pattern 9: Technical ranges (e.g., "4.5V to 18V", "100 Hz to 10 kHz")
      match = trimmed.match(/([A-Za-z][^:]{2,40})\s*:?\s*(\d+(?:[.,]\d+)?\s*[A-Za-z]+\s*to\s*\d+(?:[.,]\d+)?\s*[A-Za-z]+)/);
      if (match) {
        const label = match[1].trim();
        const value = match[2].trim();
        pairs.push({
          label,
          value,
          confidence: 0.85,
          sourceContext: trimmed,
          pageRef: block.page,
        });
      }
    }
  }
  
  return pairs;
}

/**
 * Table-based extraction for structured data
 */
function extractFromTables(tables: Array<any>): MetricCandidate[] {
  const candidates: MetricCandidate[] = [];
  
  for (const table of tables) {
    if (!table.rows || !Array.isArray(table.rows)) continue;
    
    for (const row of table.rows) {
      if (!row.cells || row.cells.length < 2) continue;
      
      // Assume first column is label, second is value
      const labelCell = row.cells[0];
      const valueCell = row.cells[1];
      
      if (labelCell?.text && valueCell?.text) {
        const value = parseValue(valueCell.text.trim());
        candidates.push({
          label: labelCell.text.trim(),
          value: value.value,
          unit: value.unit,
          confidence: 0.9, // Tables are usually more reliable
          sourceContext: `Table: ${labelCell.text} = ${valueCell.text}`,
          pageRef: table.page,
        });
      }
    }
  }
  
  return candidates;
}

/**
 * Domain-specific heuristic extraction for easy fields before LLM processing
 * Implements regex/rules for high-confidence extraction patterns
 */
function extractWithDomainHeuristics(
  textBlocks: Array<{ text: string; page?: number }>,
  domainProfile: any
): MetricCandidate[] {
  const candidates: MetricCandidate[] = [];
  const domain = domainProfile.domain;
  
  console.log("DEBUG: Running domain heuristics for", domain);
  
  for (const block of textBlocks) {
    const text = block.text;
    
    // Semiconductor-specific heuristics
    if (domain === 'semiconductors') {
      // Supply voltage patterns: "VDD = 3.3V", "Supply: 1.8V to 5.5V"
      const voltageMatch = text.match(/(VDD|VCC|Supply[\s\w]*[Vv]oltage)[\s:=]+(\d+(?:\.\d+)?(?:\s*to\s*\d+(?:\.\d+)?)?)\s*V/gi);
      if (voltageMatch) {
        voltageMatch.forEach(match => {
          const valueMatch = match.match(/(\d+(?:\.\d+)?(?:\s*to\s*\d+(?:\.\d+)?)?)\s*V/i);
          if (valueMatch) {
            candidates.push({
              label: "supply_voltage",
              value: valueMatch[1],
              unit: "V",
              confidence: 0.95,
              sourceContext: match,
              pageRef: block.page
            });
          }
        });
      }
      
      // Operating temperature: "-40°C to +125°C", "Temp: -40 to 85°C"
      const tempMatch = text.match(/(Operating|Ambient|Junction)?[\s\w]*[Tt]emperature[\s:]*(-?\d+(?:\.\d+)?\s*°?C?\s*to\s*[+-]?\d+(?:\.\d+)?\s*°C)/gi);
      if (tempMatch) {
        tempMatch.forEach(match => {
          const rangeMatch = match.match(/(-?\d+(?:\.\d+)?\s*°?C?\s*to\s*[+-]?\d+(?:\.\d+)?\s*°C)/i);
          if (rangeMatch) {
            candidates.push({
              label: "temperature_range",
              value: rangeMatch[1],
              unit: "°C",
              confidence: 0.93,
              sourceContext: match,
              pageRef: block.page
            });
          }
        });
      }
      
      // Package/Form factor: "Package: TSSOP-14", "QFN-32"
      const packageMatch = text.match(/(Package|Form[\s\w]*Factor)[\s:]+([A-Z]{2,6}-?\d+)/gi);
      if (packageMatch) {
        packageMatch.forEach(match => {
          const pkgMatch = match.match(/([A-Z]{2,6}-?\d+)/i);
          if (pkgMatch) {
            candidates.push({
              label: "form_factor",
              value: pkgMatch[1],
              confidence: 0.9,
              sourceContext: match,
              pageRef: block.page
            });
          }
        });
      }
    }
    
    // API/SDK specific heuristics
    if (domain === 'api_sdk') {
      // Rate limits: "1000 requests/minute", "Rate limit: 5000/hour"
      const rateLimitMatch = text.match(/(Rate[\s\w]*[Ll]imit|API[\s\w]*[Ll]imit)[\s:]*([\d,]+)\s*(?:requests?|calls?)?\s*[\/\s]*(minute|hour|second|min|hr|sec|s)/gi);
      if (rateLimitMatch) {
        rateLimitMatch.forEach(match => {
          const valueMatch = match.match(/([\d,]+)\s*(?:requests?|calls?)?\s*[\/\s]*(minute|hour|second|min|hr|sec|s)/i);
          if (valueMatch) {
            const value = parseFloat(valueMatch[1].replace(/,/g, ''));
            const unit = valueMatch[2].toLowerCase().startsWith('m') ? 'req/min' : 
                        valueMatch[2].toLowerCase().startsWith('h') ? 'req/hr' : 'req/s';
            candidates.push({
              label: "rate_limit",
              value,
              unit,
              confidence: 0.92,
              sourceContext: match,
              pageRef: block.page
            });
          }
        });
      }
      
      // Base URL: "https://api.example.com/v1"
      const urlMatch = text.match(/(Base[\s\w]*URL|API[\s\w]*[Ee]ndpoint)[\s:]*([a-zA-Z][a-zA-Z\d+.-]*:\/\/[^\s]+)/gi);
      if (urlMatch) {
        urlMatch.forEach(match => {
          const urlPart = match.match(/([a-zA-Z][a-zA-Z\d+.-]*:\/\/[^\s]+)/i);
          if (urlPart) {
            candidates.push({
              label: "base_url",
              value: urlPart[1],
              confidence: 0.95,
              sourceContext: match,
              pageRef: block.page
            });
          }
        });
      }
    }
    
    // Software B2B specific heuristics  
    if (domain === 'software_b2b') {
      // Uptime SLA: "99.9% uptime", "SLA: 99.95%"
      const uptimeMatch = text.match(/(Uptime|SLA|Availability)[\s:]*([\d.]+)%/gi);
      if (uptimeMatch) {
        uptimeMatch.forEach(match => {
          const percentMatch = match.match(/([\d.]+)%/i);
          if (percentMatch) {
            const value = parseFloat(percentMatch[1]);
            if (value >= 90) { // Sanity check for uptime
              candidates.push({
                label: "sla_uptime",
                value,
                unit: "percent",
                confidence: 0.9,
                sourceContext: match,
                pageRef: block.page
              });
            }
          }
        });
      }
      
      // Pricing: "$99/month", "Starting at $49 per user"
      const priceMatch = text.match(/(Price|Cost|Starting[\s\w]*at)[\s:]*\$([\d,.]+)\s*(?:\/|per)?\s*(month|user|year|annual)?/gi);
      if (priceMatch) {
        priceMatch.forEach(match => {
          const valueMatch = match.match(/\$([\d,.]+)/i);
          if (valueMatch) {
            const value = parseFloat(valueMatch[1].replace(/,/g, ''));
            candidates.push({
              label: "price_list",
              value,
              unit: "USD",
              confidence: 0.88,
              sourceContext: match,
              pageRef: block.page
            });
          }
        });
      }
    }
  }
  
  console.log(`DEBUG: Domain heuristics for ${domain} found ${candidates.length} candidates`);
  return candidates;
}

/**
 * Apply domain-specific post-processing to extracted metrics
 * Implements final validation and domain-specific adjustments
 */
function applyDomainPostProcessing(
  metrics: MetricCandidate[],
  domainProfile?: any
): MetricCandidate[] {
  if (!domainProfile) return metrics;
  
  return metrics.map(metric => {
    // Apply domain-specific confidence adjustments
    let adjustedConfidence = metric.confidence;
    
    // Boost confidence for required fields in domain
    const isRequiredField = domainProfile.active_fields?.some(
      (f: any) => f.field === metric.label && f.required
    );
    if (isRequiredField) {
      adjustedConfidence = Math.min(1.0, adjustedConfidence + 0.1);
    }
    
    // Apply domain-specific unit normalization
    let normalizedUnit = metric.unit;
    if (domainProfile.unit_targets && domainProfile.unit_targets[metric.label]) {
      normalizedUnit = domainProfile.unit_targets[metric.label];
    }
    
    // Apply canonicalizations
    let normalizedValue = metric.value;
    if (domainProfile.canonicalizations && domainProfile.canonicalizations[metric.label]) {
      const canonMap = domainProfile.canonicalizations[metric.label];
      if (typeof normalizedValue === 'string' && canonMap[normalizedValue]) {
        normalizedValue = canonMap[normalizedValue];
        adjustedConfidence = Math.min(1.0, adjustedConfidence + 0.05);
      }
    }
    
    return {
      ...metric,
      value: normalizedValue,
      unit: normalizedUnit,
      confidence: adjustedConfidence
    };
  });
}

/**
 * Parse a raw value string into typed value + unit
 */
function parseValue(rawValue: string): { value: string | number | boolean; unit?: string } {
  const trimmed = rawValue.trim();
  
  // Boolean values
  const truthy = ["yes", "true", "supported", "available", "enabled", "✓"];
  const falsy = ["no", "false", "not supported", "unavailable", "disabled", "✗", "—", "-"];
  
  if (truthy.some(t => trimmed.toLowerCase().includes(t))) {
    return { value: true, unit: "boolean" };
  }
  if (falsy.some(f => trimmed.toLowerCase().includes(f))) {
    return { value: false, unit: "boolean" };
  }
  
  // Numeric with unit
  const numMatch = trimmed.match(/^[\$€£]?(\d+(?:[,.]\d+)?)\s*([a-zA-Z/%]+)?$/);
  if (numMatch) {
    const num = parseFloat(numMatch[1].replace(/,/g, ""));
    let unit = numMatch[2]?.toLowerCase();
    
    // Handle currency symbols
    if (trimmed.startsWith('$')) unit = 'USD';
    else if (trimmed.startsWith('€')) unit = 'EUR';
    else if (trimmed.startsWith('£')) unit = 'GBP';
    else if (trimmed.includes('%')) unit = 'percent';
    
    return { value: num, unit };
  }
  
  // Default to string
  return { value: trimmed };
}