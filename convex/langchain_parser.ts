/**
 * LangChain-based Semantic Parser
 * Implements the semantic parsing pipeline as described in back-end.md section 4.3
 */

import { ChatOpenAI } from "@langchain/openai";
import { PromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
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

// LangChain prompt for semantic parsing
const SEMANTIC_PARSING_PROMPT = PromptTemplate.fromTemplate(`
You are an expert at extracting structured metrics from technical PDF documents (datasheets, spec sheets, pricing pages).

Given the following text blocks from a PDF document, extract all measurable metrics, features, and specifications.

Focus on:
1. Performance metrics (throughput, latency, response time, etc.)
2. Pricing information (costs, plans, pricing tiers)
3. Compliance features (SOC2, GDPR, certifications)
4. Technical limits (max users, concurrent connections, etc.)
5. Support metrics (SLA, response times)

Text to analyze:
{text}

For each metric found, provide:
- label: The descriptive name/label for this metric
- value: The actual value (number, boolean, or string)
- unit: Unit of measurement if applicable (ms, $, %, count, etc.)
- confidence: Your confidence in this extraction (0.0 to 1.0)
- sourceContext: The original text snippet containing this metric
- pageRef: Page number if mentioned

Return ONLY a valid JSON array of metric objects. No explanations.

Example format:
[
  {
    "label": "Monthly Price",
    "value": 99,
    "unit": "USD",
    "confidence": 0.95,
    "sourceContext": "Enterprise Plan: $99/month",
    "pageRef": 2
  },
  {
    "label": "SOC2 Compliance",
    "value": true,
    "unit": "boolean",
    "confidence": 0.9,
    "sourceContext": "SOC2 Type II certified",
    "pageRef": 1
  }
]
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
      openAIApiKey: openaiApiKey,
      modelName: "gpt-4o-mini", // Fast and cost-effective for structured extraction
      temperature: 0, // Deterministic output for consistent results
    });

    const outputParser = new StringOutputParser();
    const chain = SEMANTIC_PARSING_PROMPT.pipe(llm).pipe(outputParser);

    // Combine text blocks into structured input
    const combinedText = textBlocks
      .map((block, idx) => `Page ${block.page || idx + 1}:\n${block.text}`)
      .join("\n\n---\n\n");

    // Run LangChain extraction
    const response = await chain.invoke({ text: combinedText });

    // Parse and validate the response
    let parsedMetrics: any[];
    try {
      parsedMetrics = JSON.parse(response);
    } catch (parseError) {
      console.error("Failed to parse LangChain response as JSON:", response);
      return [];
    }

    // Validate each metric against our schema
    const validatedMetrics: MetricCandidate[] = [];
    for (const metric of parsedMetrics) {
      try {
        const validated = MetricCandidateSchema.parse(metric);
        validatedMetrics.push(validated);
      } catch (validationError) {
        console.warn("Invalid metric format from LangChain:", metric, validationError);
      }
    }

    return validatedMetrics;
  } catch (error) {
    console.error("LangChain semantic parsing failed:", error);
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
 * Pattern-based extraction as fallback (existing logic)
 */
function extractWithPatterns(textBlocks: Array<{ text: string; page?: number }>): MetricCandidate[] {
  const pairs: MetricCandidate[] = [];
  
  for (const block of textBlocks) {
    const lines = block.text.split('\n').filter(line => line.trim().length > 0);
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length < 5) continue;
      
      let match;
      
      // Pattern 1: Colon-separated (e.g., "Price: $99", "Latency: 50ms")
      match = trimmed.match(/^\s*([A-Za-z][^:]{4,40})\s*:\s*(.{1,100})\s*$/);
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
      
      // Pattern 2: Numeric with units (e.g., "Throughput 1000 req/s")
      match = trimmed.match(/^\s*([A-Za-z][^0-9]{4,40})\s+(\d+[.,]?\d*\s*[a-zA-Z/%]+)\s*$/);
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