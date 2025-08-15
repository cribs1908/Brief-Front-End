/**
 * Domain-specific extraction rules and regex patterns
 * Implements PRD requirement for regex/rules before LLM processing
 * These rules handle easy, high-confidence extractions deterministically
 */

import type { DomainProfile } from "./domain_profiles";
import type { MetricCandidate } from "./langchain_parser";

export interface ExtractionRule {
  field: string;
  pattern: RegExp;
  confidence: number;
  unit?: string;
  valueTransform?: (match: RegExpMatchArray) => any;
  contextPattern?: RegExp; // Optional context validation
}

export interface DomainExtractionRules {
  domain: string;
  rules: ExtractionRule[];
}

// Semiconductor-specific extraction rules
const SEMICONDUCTOR_RULES: ExtractionRule[] = [
  // Supply voltage patterns
  {
    field: "supply_voltage",
    pattern: /(VDD|VCC|Supply[^:]*[Vv]oltage|Operating[^:]*[Vv]oltage)\s*[:=]\s*(\d+(?:\.\d+)?(?:\s*to\s*\d+(?:\.\d+)?)?)\s*V/gi,
    confidence: 0.95,
    unit: "V",
    valueTransform: (match) => match[2]
  },
  {
    field: "supply_voltage", 
    pattern: /(\d+(?:\.\d+)?)\s*V\s*(?:to|\-|–)\s*(\d+(?:\.\d+)?)\s*V(?:\s*supply|\s*operating|\s*VDD|\s*VCC)?/gi,
    confidence: 0.93,
    unit: "V",
    valueTransform: (match) => `${match[1]} to ${match[2]}`
  },
  
  // Power consumption patterns
  {
    field: "power_typical",
    pattern: /(Supply[^:]*[Cc]urrent|Quiescent[^:]*[Cc]urrent|IQ|ICC|IDD|Operating[^:]*[Cc]urrent)\s*[:=]\s*(\d+(?:\.\d+)?)\s*(µA|uA|mA|A)/gi,
    confidence: 0.94,
    valueTransform: (match) => parseFloat(match[2]),
    unit: "mA" // Will be converted if needed
  },
  
  // Operating temperature
  {
    field: "temperature_range",
    pattern: /(Operating|Ambient|Junction)?\s*[Tt]emperature\s*[:=]?\s*(-?\d+(?:\.\d+)?)\s*°?C?\s*to\s*([+-]?\d+(?:\.\d+)?)\s*°C/gi,
    confidence: 0.92,
    unit: "°C",
    valueTransform: (match) => `${match[2]} to ${match[3]}`
  },
  
  // Package/Form factor
  {
    field: "form_factor",
    pattern: /(Package|Form[^:]*Factor)\s*[:=]\s*([A-Z]{2,6}-?\d+(?:\(\d+\))?)/gi,
    confidence: 0.90,
    valueTransform: (match) => match[2]
  },
  
  // Clock/Switching frequency
  {
    field: "frequency_max",
    pattern: /(Clock|Switching|Operating)\s*[Ff]requency\s*[:=]\s*(\d+(?:\.\d+)?)\s*(Hz|kHz|MHz|GHz)/gi,
    confidence: 0.91,
    valueTransform: (match) => parseFloat(match[2]),
    unit: "MHz"
  },
  
  // Efficiency patterns
  {
    field: "efficiency",
    pattern: /[Ee]fficiency\s*[:=]\s*(\d+(?:\.\d+)?)\s*%/gi,
    confidence: 0.89,
    unit: "percent",
    valueTransform: (match) => parseFloat(match[1])
  }
];

// API/SDK specific extraction rules
const API_SDK_RULES: ExtractionRule[] = [
  // Rate limits
  {
    field: "rate_limit",
    pattern: /(Rate[^:]*[Ll]imit|API[^:]*[Ll]imit)\s*[:=]\s*([\d,]+)\s*(?:requests?|calls?)\s*[\s\/]*(per\s*)?(minute|hour|second|min|hr|sec|s)/gi,
    confidence: 0.92,
    valueTransform: (match) => parseInt(match[2].replace(/,/g, '')),
    unit: "req/min" // Will normalize based on time unit
  },
  
  // Base URL
  {
    field: "base_url",
    pattern: /(Base[^:]*URL|API[^:]*[Ee]ndpoint)\s*[:=]\s*(https?:\/\/[^\s\)]+)/gi,
    confidence: 0.95,
    valueTransform: (match) => match[2]
  },
  
  // Latency/Response time
  {
    field: "latency_p95",
    pattern: /(P95\s*[Ll]atency|Response[^:]*[Tt]ime|P95|95th\s*percentile)\s*[:=]\s*(\d+(?:\.\d+)?)\s*(ms|µs|us|s)/gi,
    confidence: 0.88,
    unit: "ms",
    valueTransform: (match) => parseFloat(match[2])
  },
  
  // SLA/Uptime
  {
    field: "sla_uptime",
    pattern: /(SLA|Uptime|Availability)\s*[:=]\s*(\d+(?:\.\d+)?)\s*%/gi,
    confidence: 0.90,
    unit: "percent",
    valueTransform: (match) => parseFloat(match[2])
  }
];

// Software B2B specific extraction rules
const SOFTWARE_B2B_RULES: ExtractionRule[] = [
  // Pricing patterns
  {
    field: "price_list",
    pattern: /(Price|Cost|Starting[^:]*at)\s*[:=]?\s*\$(\d+(?:,\d{3})*(?:\.\d{2})?)\s*(?:\/|per)?\s*(month|user|year|annual)?/gi,
    confidence: 0.88,
    unit: "USD",
    valueTransform: (match) => parseFloat(match[2].replace(/,/g, ''))
  },
  
  // User/seat limits
  {
    field: "quota_limits",
    pattern: /(Up\s*to|Maximum|Max)\s+(\d+(?:,\d{3})*)\s+(users?|seats?)/gi,
    confidence: 0.85,
    unit: "users",
    valueTransform: (match) => parseInt(match[2].replace(/,/g, ''))
  },
  
  // Uptime SLA
  {
    field: "sla_uptime",
    pattern: /(Uptime|SLA|Availability)\s*[:=]?\s*(\d+(?:\.\d+)?)\s*%/gi,
    confidence: 0.92,
    unit: "percent",
    valueTransform: (match) => parseFloat(match[2])
  },
  
  // SOC2 compliance
  {
    field: "cert_soc2",
    pattern: /(SOC\s*2|SOC2)\s*(compliant|certified|Type\s*II)/gi,
    confidence: 0.95,
    unit: "boolean",
    valueTransform: () => true
  },
  
  // Support response SLA
  {
    field: "support_slo",
    pattern: /(Support[^:]*response|Response[^:]*time)\s*[:=]\s*(\d+(?:\.\d+)?)\s*(hours?|hrs?|minutes?|mins?)/gi,
    confidence: 0.87,
    unit: "hours",
    valueTransform: (match) => {
      const value = parseFloat(match[2]);
      const unit = match[3].toLowerCase();
      return unit.startsWith('min') ? value / 60 : value; // Convert minutes to hours
    }
  }
];

// Networking specific extraction rules  
const NETWORKING_RULES: ExtractionRule[] = [
  // Throughput/Bandwidth
  {
    field: "throughput",
    pattern: /(Throughput|Bandwidth|Data[^:]*rate)\s*[:=]\s*(\d+(?:\.\d+)?)\s*(Kbps|Mbps|Gbps|bps)/gi,
    confidence: 0.94,
    unit: "Mbps",
    valueTransform: (match) => parseFloat(match[2])
  },
  
  // Latency
  {
    field: "latency_p50",
    pattern: /(Latency|Delay|Round[^:]*trip)\s*[:=]\s*(\d+(?:\.\d+)?)\s*(ms|µs|us|ns)/gi,
    confidence: 0.90,
    unit: "ms", 
    valueTransform: (match) => parseFloat(match[2])
  },
  
  // Power consumption
  {
    field: "power_typical",
    pattern: /(Power[^:]*consumption|Power[^:]*draw)\s*[:=]\s*(\d+(?:\.\d+)?)\s*(W|kW|watts?)/gi,
    confidence: 0.88,
    unit: "W",
    valueTransform: (match) => parseFloat(match[2])
  }
];

// Registry of all domain rules
export const DOMAIN_EXTRACTION_RULES: Record<string, ExtractionRule[]> = {
  'semiconductors': SEMICONDUCTOR_RULES,
  'api_sdk': API_SDK_RULES,
  'software_b2b': SOFTWARE_B2B_RULES,
  'networking': NETWORKING_RULES
};

/**
 * Apply domain-specific extraction rules to text blocks
 * Returns high-confidence matches before LLM processing
 */
export function applyExtractionRules(
  textBlocks: Array<{ text: string; page?: number }>,
  domainProfile: DomainProfile
): MetricCandidate[] {
  const rules = DOMAIN_EXTRACTION_RULES[domainProfile.domain] || [];
  const candidates: MetricCandidate[] = [];
  
  console.log(`DEBUG: Applying ${rules.length} extraction rules for domain: ${domainProfile.domain}`);
  
  for (const block of textBlocks) {
    const text = block.text;
    
    for (const rule of rules) {
      let match;
      rule.pattern.lastIndex = 0; // Reset regex state
      
      while ((match = rule.pattern.exec(text)) !== null) {
        try {
          const value = rule.valueTransform ? rule.valueTransform(match) : match[1];
          let unit = rule.unit;
          
          // Handle time unit normalization for rate limits
          if (rule.field === "rate_limit" && match[4]) {
            const timeUnit = match[4].toLowerCase();
            if (timeUnit.startsWith('h')) unit = "req/hr";
            else if (timeUnit.startsWith('s')) unit = "req/s";
            else unit = "req/min";
          }
          
          // Handle frequency unit conversion
          if (rule.field === "frequency_max" && match[3]) {
            const freqUnit = match[3].toLowerCase();
            if (freqUnit === 'khz') unit = "kHz";
            else if (freqUnit === 'ghz') unit = "GHz";
            else if (freqUnit === 'hz') unit = "Hz";
          }
          
          // Handle current unit conversion  
          if (rule.field === "power_typical" && match[3]) {
            const currentUnit = match[3].toLowerCase();
            if (currentUnit.includes('ua') || currentUnit.includes('µa')) unit = "µA";
            else if (currentUnit.includes('ma')) unit = "mA";
            else if (currentUnit === 'a') unit = "A";
          }
          
          candidates.push({
            label: rule.field,
            value,
            unit,
            confidence: rule.confidence,
            sourceContext: match[0],
            pageRef: block.page
          });
          
        } catch (error) {
          console.warn(`Failed to process rule match for ${rule.field}:`, error);
        }
      }
    }
  }
  
  console.log(`DEBUG: Extraction rules found ${candidates.length} candidates`);
  return candidates;
}

/**
 * Get extraction rules for a specific domain
 */
export function getDomainRules(domain: string): ExtractionRule[] {
  return DOMAIN_EXTRACTION_RULES[domain] || [];
}

/**
 * Add custom extraction rule for a domain
 */
export function addExtractionRule(domain: string, rule: ExtractionRule): void {
  if (!DOMAIN_EXTRACTION_RULES[domain]) {
    DOMAIN_EXTRACTION_RULES[domain] = [];
  }
  DOMAIN_EXTRACTION_RULES[domain].push(rule);
}