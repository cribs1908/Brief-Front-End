/**
 * Profili di dominio con regole specifiche
 * Ogni profilo definisce come estrarre e normalizzare i dati per un dominio
 * Implementa applogic.md sezione 4
 */

import { SUPPORTED_DOMAINS, UNIVERSAL_SCHEMA } from "./domain_schema";
import type { Domain } from "./domain_schema";

export interface DomainProfile {
  domain: Domain;
  version: string;
  
  // Campi attivi e loro priorità per questo dominio
  active_fields: {
    section: string;
    field: string;
    priority: number;
    display_label: string;
    required: boolean;
  }[];
  
  // Mappatura sinonimi specifici del dominio
  field_synonyms: Record<string, string[]>;
  
  // Sezioni prioritarie nel documento (ordine di ricerca)
  priority_sections: string[];
  
  // Regole per range (min/typ/max) - quale valore usare
  range_rules: Record<string, "min" | "typ" | "max" | "range">;
  
  // Unità target per conversioni
  unit_targets: Record<string, string>;
  
  // Canonicalizzazioni (normalizzazioni di enum)
  canonicalizations: Record<string, Record<string, string>>;
  
  // Soglie di validazione per outlier detection
  validation_thresholds: Record<string, {
    min?: number;
    max?: number;
    expected_units?: string[];
    plausibility_check?: string;
  }>;
  
  // Selettori di sezione (keywords per trovare blocchi)
  section_selectors: Record<string, string[]>;
}

// Profilo Semiconductors (Chip, Sensori, MCU, ADC/DAC, etc.)
const SEMICONDUCTORS_PROFILE: DomainProfile = {
  domain: SUPPORTED_DOMAINS.SEMICONDUCTORS,
  version: "1.0",
  
  active_fields: [
    // Identity
    { section: "identity", field: "product_model", priority: 10, display_label: "Product/Model", required: true },
    { section: "identity", field: "form_factor", priority: 8, display_label: "Package", required: false },
    { section: "identity", field: "interfaces", priority: 7, display_label: "Interfaces", required: false },
    
    // Performance
    { section: "performance", field: "frequency_compute", priority: 10, display_label: "Frequency", required: false },
    { section: "performance", field: "operating_range", priority: 9, display_label: "Operating Range", required: false },
    { section: "performance", field: "accuracy", priority: 7, display_label: "Accuracy", required: false },
    
    // Environment - CRITICO per chip
    { section: "environment", field: "power_typical", priority: 10, display_label: "Supply Current", required: true },
    { section: "environment", field: "power_max", priority: 9, display_label: "Max Current", required: false },
    { section: "environment", field: "efficiency", priority: 8, display_label: "Efficiency", required: false },
    { section: "environment", field: "temperature_range", priority: 10, display_label: "Operating Temperature", required: true },
    
    // Economics
    { section: "economics", field: "price_list", priority: 6, display_label: "Unit Price", required: false }
  ],
  
  field_synonyms: {
    "product_model": ["part number", "device", "IC", "component", "model", "product name"],
    "frequency_compute": ["clock frequency", "operating frequency", "max frequency", "frequency", "clock", "MHz", "GHz"],
    "power_typical": ["supply current", "quiescent current", "IQ", "operating current", "current consumption", "ICC", "IDD"],
    "power_max": ["maximum current", "peak current", "max supply current"],
    "temperature_range": ["operating temperature", "temperature range", "ambient temperature", "TA", "TJ", "junction temperature"],
    "form_factor": ["package", "package type", "form factor", "enclosure", "housing"],
    "interfaces": ["communication", "interface", "protocol", "I2C", "SPI", "UART", "GPIO", "analog"],
    "accuracy": ["accuracy", "precision", "error", "INL", "DNL", "THD", "SINAD"],
    "efficiency": ["efficiency", "power efficiency", "conversion efficiency"]
  },
  
  priority_sections: [
    "electrical characteristics",
    "absolute maximum ratings", 
    "typical performance characteristics",
    "specifications",
    "features",
    "pin configuration",
    "package information"
  ],
  
  range_rules: {
    "power_typical": "typ",
    "power_max": "max", 
    "temperature_range": "range",
    "frequency_compute": "max",
    "accuracy": "typ"
  },
  
  unit_targets: {
    "power_typical": "mA",
    "power_max": "mA", 
    "frequency_compute": "MHz",
    "temperature_range": "°C",
    "accuracy": "percent",
    "efficiency": "percent"
  },
  
  canonicalizations: {
    "interfaces": {
      "I²C": "I2C",
      "i2c": "I2C",
      "spi": "SPI", 
      "uart": "UART",
      "gpio": "GPIO"
    },
    "form_factor": {
      "QFN": "QFN",
      "BGA": "BGA", 
      "TSSOP": "TSSOP",
      "SOIC": "SOIC",
      "DIP": "DIP"
    }
  },
  
  validation_thresholds: {
    "power_typical": { min: 0.001, max: 1000, expected_units: ["mA", "µA", "A"] },
    "power_max": { min: 0.001, max: 5000, expected_units: ["mA", "µA", "A"] },
    "frequency_compute": { min: 0.001, max: 10000, expected_units: ["MHz", "GHz", "Hz", "kHz"] },
    "temperature_range": { min: -273, max: 200, expected_units: ["°C", "K"] }
  },
  
  section_selectors: {
    "electrical": ["electrical characteristics", "electrical specs", "electrical parameters"],
    "thermal": ["thermal characteristics", "thermal information", "temperature"],
    "performance": ["performance", "typical performance", "characteristics"],
    "package": ["package information", "mechanical", "physical dimensions"]
  }
};

// Profilo Networking (Router, Switch, Firewall, WiFi, Access Points)
const NETWORKING_PROFILE: DomainProfile = {
  domain: SUPPORTED_DOMAINS.NETWORKING,
  version: "1.0",
  
  active_fields: [
    // Identity
    { section: "identity", field: "product_model", priority: 10, display_label: "Model", required: true },
    { section: "identity", field: "interfaces", priority: 9, display_label: "Interfaces", required: true },
    { section: "identity", field: "form_factor", priority: 7, display_label: "Form Factor", required: false },
    
    // Performance - CRITICO per networking
    { section: "performance", field: "throughput", priority: 10, display_label: "Throughput", required: true },
    { section: "performance", field: "latency_p50", priority: 9, display_label: "Latency", required: true },
    { section: "performance", field: "iops", priority: 7, display_label: "PPS", required: false },
    
    // Environment
    { section: "environment", field: "power_typical", priority: 8, display_label: "Power Consumption", required: false },
    { section: "environment", field: "temperature_range", priority: 7, display_label: "Operating Temperature", required: false },
    
    // Reliability 
    { section: "reliability", field: "sla_uptime", priority: 9, display_label: "Uptime SLA", required: false },
    { section: "reliability", field: "ha_failover", priority: 8, display_label: "HA/Failover", required: false },
    
    // Economics
    { section: "economics", field: "price_list", priority: 8, display_label: "List Price", required: false },
    { section: "economics", field: "rate_limits", priority: 7, display_label: "Rate Limits", required: false },
    
    // Operations
    { section: "operations", field: "support_slo", priority: 7, display_label: "Support SLA", required: false }
  ],
  
  field_synonyms: {
    "product_model": ["model", "device", "equipment", "product", "system"],
    "throughput": ["bandwidth", "data rate", "capacity", "Mbps", "Gbps", "throughput", "speed"],
    "latency_p50": ["latency", "delay", "response time", "round trip time", "RTT"],
    "iops": ["packets per second", "PPS", "frame rate", "packet rate"],
    "interfaces": ["ports", "interfaces", "connections", "ethernet", "fiber", "copper"],
    "power_typical": ["power consumption", "power", "watts", "W", "power draw"],
    "sla_uptime": ["uptime", "availability", "uptime SLA", "service level"],
    "ha_failover": ["redundancy", "failover", "high availability", "backup", "clustering"],
    "rate_limits": ["throughput limit", "bandwidth limit", "rate limiting", "QoS"]
  },
  
  priority_sections: [
    "specifications",
    "performance",
    "network specifications", 
    "interface specifications",
    "features",
    "technical specifications"
  ],
  
  range_rules: {
    "throughput": "max",
    "latency_p50": "typ",
    "power_typical": "typ",
    "temperature_range": "range"
  },
  
  unit_targets: {
    "throughput": "Mbps",
    "latency_p50": "ms",
    "iops": "pps",
    "power_typical": "W",
    "temperature_range": "°C",
    "sla_uptime": "percent",
    "support_slo": "hours"
  },
  
  canonicalizations: {
    "interfaces": {
      "Ethernet": "Ethernet",
      "ethernet": "Ethernet",
      "10GbE": "10 Gigabit Ethernet",
      "WiFi": "Wi-Fi",
      "wifi": "Wi-Fi"
    }
  },
  
  validation_thresholds: {
    "throughput": { min: 0.1, max: 100000, expected_units: ["Mbps", "Gbps", "Kbps"] },
    "latency_p50": { min: 0.001, max: 1000, expected_units: ["ms", "µs", "ns"] },
    "power_typical": { min: 1, max: 10000, expected_units: ["W", "kW"] },
    "sla_uptime": { min: 90, max: 100, expected_units: ["percent"] }
  },
  
  section_selectors: {
    "performance": ["performance", "specifications", "capacity"],
    "interfaces": ["interfaces", "ports", "connectivity"],
    "power": ["power", "electrical", "consumption"]
  }
};

// Profilo Software B2B (SaaS, CRM, Ticketing, etc.)
const SOFTWARE_B2B_PROFILE: DomainProfile = {
  domain: SUPPORTED_DOMAINS.SOFTWARE_B2B,
  version: "1.0",
  
  active_fields: [
    // Identity
    { section: "identity", field: "product_model", priority: 10, display_label: "Product", required: true },
    { section: "identity", field: "version_fw", priority: 8, display_label: "Version", required: false },
    { section: "identity", field: "ecosystem_sdk", priority: 7, display_label: "Integrations", required: false },
    
    // Performance
    { section: "performance", field: "throughput", priority: 8, display_label: "API Rate Limit", required: false },
    { section: "performance", field: "latency_p50", priority: 7, display_label: "Response Time", required: false },
    
    // Reliability - CRITICO per SaaS
    { section: "reliability", field: "sla_uptime", priority: 10, display_label: "Uptime SLA", required: true },
    { section: "reliability", field: "cert_soc2", priority: 9, display_label: "SOC2", required: false },
    { section: "reliability", field: "cert_iso", priority: 8, display_label: "ISO 27001", required: false },
    { section: "reliability", field: "encryption", priority: 8, display_label: "Encryption", required: false },
    
    // Economics - CRITICO per SaaS
    { section: "economics", field: "price_list", priority: 10, display_label: "Monthly Price", required: true },
    { section: "economics", field: "price_tier", priority: 9, display_label: "Pricing Tiers", required: false },
    { section: "economics", field: "quota_limits", priority: 8, display_label: "User Limits", required: false },
    
    // Operations
    { section: "operations", field: "support_slo", priority: 8, display_label: "Support Response", required: false },
    { section: "operations", field: "deployment", priority: 7, display_label: "Deployment", required: false }
  ],
  
  field_synonyms: {
    "product_model": ["product", "software", "platform", "solution", "service"],
    "sla_uptime": ["uptime", "availability", "SLA", "service level", "uptime guarantee"],
    "cert_soc2": ["SOC2", "SOC 2", "SOC2 compliant", "SOC2 certified"],
    "cert_iso": ["ISO 27001", "ISO27001", "ISO certification"],
    "price_list": ["price", "pricing", "cost", "monthly", "subscription", "plan"],
    "price_tier": ["tiers", "plans", "packages", "editions"],
    "quota_limits": ["users", "seats", "user limit", "maximum users", "concurrent users"],
    "throughput": ["API limit", "rate limit", "requests per minute", "API calls"],
    "support_slo": ["support", "response time", "support SLA", "ticket response"],
    "deployment": ["hosting", "deployment", "cloud", "on-premise", "hybrid"],
    "ecosystem_sdk": ["integrations", "connectors", "APIs", "webhooks", "marketplace"]
  },
  
  priority_sections: [
    "pricing",
    "features", 
    "plans",
    "security",
    "compliance",
    "support",
    "SLA",
    "integrations"
  ],
  
  range_rules: {
    "price_list": "min", // Prezzo base
    "quota_limits": "min", // Minimo incluso
    "throughput": "typ"
  },
  
  unit_targets: {
    "price_list": "USD",
    "sla_uptime": "percent",
    "throughput": "req/min",
    "support_slo": "hours",
    "quota_limits": "users"
  },
  
  canonicalizations: {
    "deployment": {
      "cloud": "Cloud",
      "on-premise": "On-Premise", 
      "on-prem": "On-Premise",
      "hybrid": "Hybrid",
      "saas": "SaaS"
    },
    "encryption": {
      "AES-256": "AES-256",
      "TLS": "TLS",
      "SSL": "TLS",
      "end-to-end": "End-to-End"
    }
  },
  
  validation_thresholds: {
    "price_list": { min: 0, max: 100000, expected_units: ["USD", "EUR", "GBP"] },
    "sla_uptime": { min: 90, max: 100, expected_units: ["percent"] },
    "quota_limits": { min: 1, max: 1000000, expected_units: ["users", "seats"] },
    "support_slo": { min: 0.25, max: 168, expected_units: ["hours", "days"] }
  },
  
  section_selectors: {
    "pricing": ["pricing", "plans", "cost", "subscription"],
    "security": ["security", "compliance", "certifications"],
    "features": ["features", "capabilities", "functionality"],
    "support": ["support", "SLA", "service level"]
  }
};

// Registry di tutti i profili
export const DOMAIN_PROFILES: Record<Domain, DomainProfile> = {
  [SUPPORTED_DOMAINS.SEMICONDUCTORS]: SEMICONDUCTORS_PROFILE,
  [SUPPORTED_DOMAINS.NETWORKING]: NETWORKING_PROFILE,
  [SUPPORTED_DOMAINS.SOFTWARE_B2B]: SOFTWARE_B2B_PROFILE,
  
  // TODO: Implementare altri profili
  [SUPPORTED_DOMAINS.COMPUTE_STORAGE]: SOFTWARE_B2B_PROFILE, // Placeholder
  [SUPPORTED_DOMAINS.ENERGY]: SEMICONDUCTORS_PROFILE, // Placeholder - simile a chip
  [SUPPORTED_DOMAINS.INDUSTRIAL]: SEMICONDUCTORS_PROFILE, // Placeholder
  [SUPPORTED_DOMAINS.MEDICAL]: SEMICONDUCTORS_PROFILE, // Placeholder
  [SUPPORTED_DOMAINS.API_SDK]: SOFTWARE_B2B_PROFILE, // Placeholder - simile a SaaS
  [SUPPORTED_DOMAINS.SECURITY]: SOFTWARE_B2B_PROFILE, // Placeholder
  [SUPPORTED_DOMAINS.TELCO_EDGE]: NETWORKING_PROFILE // Placeholder - simile a networking
};

/**
 * Ottiene il profilo per un dominio
 */
export function getDomainProfile(domain: Domain): DomainProfile {
  return DOMAIN_PROFILES[domain];
}

/**
 * Ottiene i campi attivi per un dominio in ordine di priorità
 */
export function getActiveFields(domain: Domain): DomainProfile['active_fields'] {
  const profile = getDomainProfile(domain);
  return profile.active_fields.sort((a, b) => b.priority - a.priority);
}

/**
 * Ottiene i sinonimi per un campo in un dominio
 */
export function getFieldSynonyms(domain: Domain, fieldKey: string): string[] {
  const profile = getDomainProfile(domain);
  return profile.field_synonyms[fieldKey] || [];
}

/**
 * Valida un valore estratto contro le soglie del dominio
 */
export function validateFieldValue(
  domain: Domain, 
  fieldKey: string, 
  value: any, 
  unit?: string
): { isValid: boolean; status: string; notes?: string } {
  const profile = getDomainProfile(domain);
  const threshold = profile.validation_thresholds[fieldKey];
  
  if (!threshold) {
    return { isValid: true, status: "valid" };
  }
  
  // Controlla unità attese
  if (threshold.expected_units && unit && !threshold.expected_units.includes(unit)) {
    return { 
      isValid: false, 
      status: "needs_review",
      notes: `Unexpected unit: ${unit}. Expected: ${threshold.expected_units.join(", ")}`
    };
  }
  
  // Controlla range numerico
  if (typeof value === "number") {
    if (threshold.min !== undefined && value < threshold.min) {
      return { 
        isValid: false, 
        status: "invalid",
        notes: `Value ${value} below minimum ${threshold.min}`
      };
    }
    
    if (threshold.max !== undefined && value > threshold.max) {
      return { 
        isValid: false, 
        status: "needs_review",
        notes: `Value ${value} above expected maximum ${threshold.max} - please verify`
      };
    }
  }
  
  return { isValid: true, status: "valid" };
}