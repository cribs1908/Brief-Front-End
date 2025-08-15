/**
 * LangChain-based Semantic Parser
 * Implements the semantic parsing pipeline as described in back-end.md section 4.3
 */

import { ChatOpenAI } from "@langchain/openai";
import { PromptTemplate } from "@langchain/core/prompts";
import { StructuredOutputParser } from "langchain/output_parsers";
import { z } from "zod";

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
 * LangChain-powered semantic parser for extracting metrics from text
 * Implements the Information Extraction pipeline from back-end.md section 4.3
 */
export async function parseMetricsWithLangChain(
  textBlocks: Array<{ text: string; page?: number }>,
  openaiApiKey?: string
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

    // Create chain with structured output parser
    const chain = SEMANTIC_PARSING_PROMPT.pipe(llm).pipe(outputParser);

    // Run LangChain extraction with format instructions
    const rawResponse = await llm.invoke([
      {
        type: "human", 
        content: SEMANTIC_PARSING_PROMPT.format({
          text: combinedText,
          format_instructions: outputParser.getFormatInstructions()
        })
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
    
    // Validate against schema
    const validatedResponse = MetricCandidatesArraySchema.parse(parsedResponse);
    
    console.log("DEBUG: Validated metrics count:", validatedResponse.length);
    return validatedResponse;
    
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
  openaiApiKey?: string
): Promise<MetricCandidate[]> {
  const candidates: MetricCandidate[] = [];

  // Try LangChain first for semantic understanding
  if (openaiApiKey) {
    const langchainResults = await parseMetricsWithLangChain(textBlocks, openaiApiKey);
    candidates.push(...langchainResults);
  }

  // Fallback to pattern matching for additional coverage
  const patternResults = extractWithPatterns(textBlocks);
  
  // Merge results, preferring LangChain for duplicates
  const seenLabels = new Set(candidates.map(c => c.label.toLowerCase()));
  for (const pattern of patternResults) {
    if (!seenLabels.has(pattern.label.toLowerCase())) {
      candidates.push(pattern);
    }
  }

  // Extract from tables using structured approach
  const tableResults = extractFromTables(tables);
  candidates.push(...tableResults);

  return candidates;
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