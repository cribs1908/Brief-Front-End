/**
 * Deterministic unit conversion and composite confidence scoring
 * Implements PRD requirements for normalization and quality assessment
 */

import type { MetricCandidate } from "./langchain_parser";
import type { DomainProfile } from "./domain_profiles";

export interface UnitConversion {
  success: boolean;
  originalValue: number;
  convertedValue?: number;
  originalUnit: string;
  targetUnit: string;
  conversionFactor?: number;
  confidence: number; // Confidence in the conversion
}

export interface ConfidenceFactors {
  extraction_method: number;    // How was the value extracted? (0.5-1.0)
  unit_conversion: number;      // Was unit conversion needed? (0.7-1.0)
  context_clarity: number;      // How clear was the context? (0.6-1.0)
  domain_relevance: number;     // How relevant to domain? (0.5-1.0)
  pattern_match_quality: number; // How well did pattern match? (0.7-1.0)
}

export interface CompositeConfidence {
  overall: number;
  factors: ConfidenceFactors;
  reasoning: string[];
}

// Comprehensive unit conversion tables
const UNIT_CONVERSIONS: Record<string, Record<string, number>> = {
  // Voltage conversions (to Volts as base)
  'voltage': {
    'mv': 0.001,
    'millivolt': 0.001,
    'millivolts': 0.001,
    'v': 1.0,
    'volt': 1.0,
    'volts': 1.0,
    'kv': 1000.0,
    'kilovolt': 1000.0,
    'kilovolts': 1000.0
  },
  
  // Current conversions (to milliamps as base)
  'current': {
    'na': 0.000001,
    'nanoamp': 0.000001,
    'nanoamps': 0.000001,
    'µa': 0.001,
    'ua': 0.001,
    'microamp': 0.001,
    'microamps': 0.001,
    'ma': 1.0,
    'milliamp': 1.0,
    'milliamps': 1.0,
    'a': 1000.0,
    'amp': 1000.0,
    'amps': 1000.0,
    'ampere': 1000.0,
    'amperes': 1000.0
  },
  
  // Frequency conversions (to MHz as base)
  'frequency': {
    'hz': 0.000001,
    'hertz': 0.000001,
    'khz': 0.001,
    'kilohertz': 0.001,
    'mhz': 1.0,
    'megahertz': 1.0,
    'ghz': 1000.0,
    'gigahertz': 1000.0,
    'thz': 1000000.0,
    'terahertz': 1000000.0
  },
  
  // Memory/Storage conversions (to KB as base)
  'memory': {
    'b': 0.0009765625,  // 1/1024
    'byte': 0.0009765625,
    'bytes': 0.0009765625,
    'kb': 1.0,
    'kilobyte': 1.0,
    'kilobytes': 1.0,
    'mb': 1024.0,
    'megabyte': 1024.0,
    'megabytes': 1024.0,
    'gb': 1048576.0,  // 1024^2
    'gigabyte': 1048576.0,
    'gigabytes': 1048576.0,
    'tb': 1073741824.0,  // 1024^3
    'terabyte': 1073741824.0,
    'terabytes': 1073741824.0
  },
  
  // Power conversions (to Watts as base)
  'power': {
    'mw': 0.001,
    'milliwatt': 0.001,
    'milliwatts': 0.001,
    'w': 1.0,
    'watt': 1.0,
    'watts': 1.0,
    'kw': 1000.0,
    'kilowatt': 1000.0,
    'kilowatts': 1000.0,
    'mw_mega': 1000000.0,  // Megawatt
    'megawatt': 1000000.0,
    'megawatts': 1000000.0
  },
  
  // Time conversions (to hours as base)
  'time': {
    'ms': 0.000000278,  // milliseconds to hours
    'millisecond': 0.000000278,
    'milliseconds': 0.000000278,
    's': 0.000278,      // seconds to hours
    'sec': 0.000278,
    'second': 0.000278,
    'seconds': 0.000278,
    'min': 0.0167,      // minutes to hours
    'minute': 0.0167,
    'minutes': 0.0167,
    'h': 1.0,
    'hr': 1.0,
    'hour': 1.0,
    'hours': 1.0,
    'day': 24.0,
    'days': 24.0,
    'week': 168.0,
    'weeks': 168.0
  },
  
  // Rate conversions (normalized to per minute)
  'rate': {
    'req/s': 60.0,      // requests per second to per minute
    'req/sec': 60.0,
    'req/second': 60.0,
    'req/min': 1.0,
    'req/minute': 1.0,
    'req/hr': 0.0167,   // requests per hour to per minute
    'req/hour': 0.0167,
    'calls/s': 60.0,
    'calls/sec': 60.0,
    'calls/min': 1.0,
    'calls/hr': 0.0167,
    'ops/s': 60.0,
    'ops/sec': 60.0,
    'ops/min': 1.0,
    'ops/hr': 0.0167
  },
  
  // Data rate conversions (to Mbps as base)
  'data_rate': {
    'bps': 0.000001,    // bits per second
    'kbps': 0.001,      // kilobits per second
    'mbps': 1.0,        // megabits per second
    'gbps': 1000.0,     // gigabits per second
    'tbps': 1000000.0   // terabits per second
  },
  
  // Currency conversions (relative, would need real-time rates)
  'currency': {
    'usd': 1.0,
    'eur': 1.1,  // Approximate
    'gbp': 1.25, // Approximate
    'jpy': 0.007, // Approximate
    'cad': 0.75,  // Approximate
    'aud': 0.7    // Approximate
  }
};

// Map field types to unit categories
const FIELD_UNIT_CATEGORIES: Record<string, string> = {
  'supply_voltage': 'voltage',
  'power_typical': 'current',
  'power_max': 'current',
  'frequency_max': 'frequency',
  'flash_memory': 'memory',
  'temperature_range': 'temperature', // Special case - no conversion
  'rate_limit': 'rate',
  'throughput': 'data_rate',
  'latency_p50': 'time',
  'latency_p95': 'time',
  'price_list': 'currency',
  'support_slo': 'time'
};

/**
 * Convert value between units deterministically
 */
export function convertUnit(
  value: number,
  fromUnit: string,
  toUnit: string,
  fieldType?: string
): UnitConversion {
  const from = fromUnit.toLowerCase().trim();
  const to = toUnit.toLowerCase().trim();
  
  // No conversion needed
  if (from === to) {
    return {
      success: true,
      originalValue: value,
      convertedValue: value,
      originalUnit: fromUnit,
      targetUnit: toUnit,
      conversionFactor: 1.0,
      confidence: 1.0
    };
  }
  
  // Determine unit category
  let category = fieldType ? FIELD_UNIT_CATEGORIES[fieldType] : null;
  
  // Auto-detect category if not provided
  if (!category) {
    for (const [cat, units] of Object.entries(UNIT_CONVERSIONS)) {
      if (units[from] && units[to]) {
        category = cat;
        break;
      }
    }
  }
  
  if (!category || !UNIT_CONVERSIONS[category]) {
    return {
      success: false,
      originalValue: value,
      originalUnit: fromUnit,
      targetUnit: toUnit,
      confidence: 0.0
    };
  }
  
  const conversionTable = UNIT_CONVERSIONS[category];
  const fromFactor = conversionTable[from];
  const toFactor = conversionTable[to];
  
  if (fromFactor === undefined || toFactor === undefined) {
    return {
      success: false,
      originalValue: value,
      originalUnit: fromUnit,
      targetUnit: toUnit,
      confidence: 0.0
    };
  }
  
  // Convert: value_in_base = value * fromFactor, value_in_target = value_in_base / toFactor
  const conversionFactor = fromFactor / toFactor;
  const convertedValue = value * conversionFactor;
  
  // Calculate confidence based on conversion complexity
  let confidence = 0.95;
  if (Math.abs(Math.log10(conversionFactor)) > 3) {
    confidence = 0.85; // Large conversion factors are less reliable
  } else if (Math.abs(Math.log10(conversionFactor)) > 1) {
    confidence = 0.9;
  }
  
  return {
    success: true,
    originalValue: value,
    convertedValue,
    originalUnit: fromUnit,
    targetUnit: toUnit,
    conversionFactor,
    confidence
  };
}

/**
 * Calculate composite confidence score based on multiple factors
 */
export function calculateCompositeConfidence(
  metric: MetricCandidate,
  domainProfile?: DomainProfile,
  conversionResult?: UnitConversion
): CompositeConfidence {
  const factors: ConfidenceFactors = {
    extraction_method: 0.8,     // Default
    unit_conversion: 1.0,       // Default (no conversion)
    context_clarity: 0.8,       // Default
    domain_relevance: 0.5,      // Default (unknown domain)
    pattern_match_quality: 0.8  // Default
  };
  
  const reasoning: string[] = [];
  
  // 1. Extraction method confidence
  if (metric.confidence >= 0.95) {
    factors.extraction_method = 0.95;
    reasoning.push("High-confidence extraction pattern");
  } else if (metric.confidence >= 0.9) {
    factors.extraction_method = 0.9;
    reasoning.push("Strong extraction pattern");
  } else if (metric.confidence >= 0.8) {
    factors.extraction_method = 0.85;
    reasoning.push("Good extraction pattern");
  } else {
    factors.extraction_method = metric.confidence;
    reasoning.push("Lower confidence extraction");
  }
  
  // 2. Unit conversion confidence
  if (conversionResult) {
    if (conversionResult.success) {
      factors.unit_conversion = conversionResult.confidence;
      if (conversionResult.conversionFactor === 1.0) {
        reasoning.push("No unit conversion needed");
      } else {
        reasoning.push(`Unit converted (${conversionResult.originalUnit} → ${conversionResult.targetUnit})`);
      }
    } else {
      factors.unit_conversion = 0.6;
      reasoning.push("Unit conversion failed - using original unit");
    }
  }
  
  // 3. Context clarity
  const contextLength = metric.sourceContext?.length || 0;
  if (contextLength > 50) {
    factors.context_clarity = 0.9;
    reasoning.push("Rich context available");
  } else if (contextLength > 20) {
    factors.context_clarity = 0.8;
    reasoning.push("Adequate context");
  } else {
    factors.context_clarity = 0.7;
    reasoning.push("Limited context");
  }
  
  // 4. Domain relevance
  if (domainProfile) {
    const profileField = domainProfile.active_fields.find(
      f => f.field === metric.label || 
          f.display_label.toLowerCase() === metric.label.toLowerCase() ||
          domainProfile.field_synonyms[f.field]?.includes(metric.label.toLowerCase())
    );
    
    if (profileField) {
      factors.domain_relevance = profileField.required ? 0.95 : 0.85;
      reasoning.push(`Field is ${profileField.required ? 'required' : 'optional'} in domain profile`);
    } else {
      factors.domain_relevance = 0.6;
      reasoning.push("Field not in domain profile");
    }
  }
  
  // 5. Pattern match quality based on source context
  if (metric.sourceContext?.includes(':') || metric.sourceContext?.includes('=')) {
    factors.pattern_match_quality = 0.9;
    reasoning.push("Clear label-value pattern");
  } else if (metric.sourceContext?.match(/\d+.*[a-zA-Z]/)) {
    factors.pattern_match_quality = 0.85;
    reasoning.push("Numeric value with unit pattern");
  } else {
    factors.pattern_match_quality = 0.75;
    reasoning.push("Basic pattern match");
  }
  
  // Calculate weighted overall confidence
  const weights = {
    extraction_method: 0.3,
    unit_conversion: 0.2,
    context_clarity: 0.15,
    domain_relevance: 0.25,
    pattern_match_quality: 0.1
  };
  
  const overall = Object.entries(factors).reduce((sum, [key, value]) => {
    return sum + (value * weights[key as keyof ConfidenceFactors]);
  }, 0);
  
  return {
    overall: Math.round(overall * 1000) / 1000, // Round to 3 decimal places
    factors,
    reasoning
  };
}

/**
 * Apply unit conversion and recalculate confidence for a metric
 */
export function normalizeMetric(
  metric: MetricCandidate,
  domainProfile?: DomainProfile
): MetricCandidate {
  let normalizedMetric = { ...metric };
  let conversionResult: UnitConversion | undefined;
  
  // Apply unit conversion if domain profile specifies target unit
  if (domainProfile && typeof metric.value === 'number' && metric.unit) {
    const targetUnit = domainProfile.unit_targets[metric.label];
    if (targetUnit && targetUnit !== metric.unit) {
      conversionResult = convertUnit(
        metric.value,
        metric.unit,
        targetUnit,
        metric.label
      );
      
      if (conversionResult.success && conversionResult.convertedValue !== undefined) {
        normalizedMetric.value = Math.round(conversionResult.convertedValue * 1000) / 1000;
        normalizedMetric.unit = targetUnit;
      }
    }
  }
  
  // Calculate composite confidence
  const compositeConfidence = calculateCompositeConfidence(
    metric,
    domainProfile,
    conversionResult
  );
  
  normalizedMetric.confidence = compositeConfidence.overall;
  
  // Add metadata for debugging/transparency
  (normalizedMetric as any).confidence_breakdown = {
    factors: compositeConfidence.factors,
    reasoning: compositeConfidence.reasoning,
    unit_conversion: conversionResult
  };
  
  return normalizedMetric;
}

/**
 * Normalize a batch of metrics with domain profile
 */
export function normalizeMetrics(
  metrics: MetricCandidate[],
  domainProfile?: DomainProfile
): MetricCandidate[] {
  console.log(`DEBUG: Normalizing ${metrics.length} metrics with domain profile:`, domainProfile?.domain);
  
  const normalized = metrics.map(metric => normalizeMetric(metric, domainProfile));
  
  // Sort by confidence (highest first)
  normalized.sort((a, b) => b.confidence - a.confidence);
  
  console.log(`DEBUG: Normalization complete. Average confidence: ${(normalized.reduce((sum, m) => sum + m.confidence, 0) / normalized.length).toFixed(3)}`);
  
  return normalized;
}