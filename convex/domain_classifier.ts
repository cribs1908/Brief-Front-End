/**
 * Sistema di classificazione domini automatico
 * Analizza il contenuto del PDF per determinare il dominio B2B
 * Implementa applogic.md sezione classificazione
 */

import { SUPPORTED_DOMAINS } from "./domain_schema";
import type { Domain } from "./domain_schema";

// Keywords per classificazione dominio
const DOMAIN_KEYWORDS = {
  [SUPPORTED_DOMAINS.SEMICONDUCTORS]: {
    primary: ["voltage", "current", "mA", "mV", "MHz", "GHz", "ADC", "DAC", "MCU", "SoC", "GPIO", "I2C", "SPI", "UART", "transistor", "MOSFET", "BJT", "operational amplifier", "comparator"],
    secondary: ["quiescent", "dropout", "switching frequency", "thermal resistance", "junction temperature", "package", "QFN", "BGA", "TSSOP", "efficiency", "THD"],
    sections: ["electrical characteristics", "absolute maximum ratings", "typical performance", "package information", "pin description"],
    negative: ["API", "endpoint", "subscription", "monthly", "user license"]
  },
  
  [SUPPORTED_DOMAINS.NETWORKING]: {
    primary: ["bandwidth", "throughput", "Mbps", "Gbps", "ethernet", "WiFi", "802.11", "TCP", "UDP", "routing", "switching", "firewall", "VLAN", "QoS", "latency"],
    secondary: ["concurrent users", "packet", "frame", "port", "interface", "protocol", "OSPF", "BGP", "SNMP", "PoE", "fiber", "copper"],
    sections: ["network specifications", "interface specifications", "performance", "routing features", "security features"],
    negative: ["voltage", "current", "mA", "temperature", "junction"]
  },
  
  [SUPPORTED_DOMAINS.COMPUTE_STORAGE]: {
    primary: ["CPU", "GPU", "RAM", "storage", "SSD", "NVMe", "IOPS", "TB", "GB", "cores", "threads", "cache", "memory", "bandwidth"],
    secondary: ["virtualization", "hypervisor", "bare metal", "instance", "VM", "container", "kubernetes", "docker", "PCIe", "SATA"],
    sections: ["technical specifications", "performance benchmarks", "storage specifications", "memory specifications"],
    negative: ["voltage", "mA", "API endpoint", "monthly subscription"]
  },
  
  [SUPPORTED_DOMAINS.ENERGY]: {
    primary: ["solar", "battery", "inverter", "UPS", "kW", "kWh", "efficiency", "power", "voltage", "AC", "DC", "grid", "renewable"],
    secondary: ["photovoltaic", "lithium", "lead acid", "MPPT", "sine wave", "backup time", "charge controller", "monitoring"],
    sections: ["electrical specifications", "performance data", "environmental conditions", "safety certifications"],
    negative: ["API", "software", "subscription", "user license", "MHz"]
  },
  
  [SUPPORTED_DOMAINS.SOFTWARE_B2B]: {
    primary: ["subscription", "monthly", "annual", "user", "license", "SaaS", "API", "dashboard", "integration", "workflow", "CRM", "ERP"],
    secondary: ["SSO", "SAML", "OAuth", "webhook", "REST", "GraphQL", "authentication", "authorization", "multi-tenant", "white-label"],
    sections: ["pricing", "features", "integrations", "security", "compliance", "support", "SLA"],
    negative: ["voltage", "current", "mA", "MHz", "temperature", "junction", "bandwidth"]
  },
  
  [SUPPORTED_DOMAINS.API_SDK]: {
    primary: ["API", "endpoint", "REST", "GraphQL", "SDK", "webhook", "rate limit", "authentication", "JSON", "XML", "HTTP"],
    secondary: ["OAuth", "API key", "bearer token", "requests per minute", "latency", "uptime", "documentation", "libraries"],
    sections: ["API reference", "authentication", "rate limiting", "response codes", "SDKs", "examples"],
    negative: ["voltage", "current", "power consumption", "temperature range", "physical dimensions"]
  },
  
  [SUPPORTED_DOMAINS.SECURITY]: {
    primary: ["security", "encryption", "firewall", "antivirus", "SIEM", "EDR", "IAM", "SSO", "threat", "vulnerability"],
    secondary: ["AES", "RSA", "certificate", "PKI", "malware", "intrusion", "compliance", "audit", "GDPR", "SOC2"],
    sections: ["security features", "compliance", "threat protection", "access control", "audit capabilities"],
    negative: ["voltage", "MHz", "bandwidth", "storage capacity", "CPU cores"]
  }
};

export interface ClassificationResult {
  domain: Domain;
  confidence: number;
  method: string;
  alternative_domains: Array<{
    domain: Domain;
    confidence: number;
  }>;
  requires_user_confirmation: boolean;
  evidence: {
    primaryMatches: string[];
    secondaryMatches: string[];
    sectionMatches: string[];
    negativeMatches: string[];
  };
}

/**
 * Classifica il dominio di un documento basandosi su contenuto estratto
 */
export function classifyDomain(
  textBlocks: Array<{ text: string; page?: number }>,
  tables: Array<any> = []
): ClassificationResult {
  
  // Combina tutto il testo per analisi
  const allText = [
    ...textBlocks.map(block => block.text),
    ...tables.flatMap(table => 
      table.rows?.flatMap((row: any) => 
        row.cells?.map((cell: any) => cell.text || "") || []
      ) || []
    )
  ].join(" ").toLowerCase();
  
  const domainScores: Record<string, number> = {};
  const evidence: Record<string, any> = {};
  
  // Calcola score per ogni dominio
  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
    let score = 0;
    const domainEvidence = {
      primaryMatches: [] as string[],
      secondaryMatches: [] as string[],
      sectionMatches: [] as string[],
      negativeMatches: [] as string[]
    };
    
    // Primary keywords (peso 3x)
    for (const keyword of keywords.primary) {
      if (allText.includes(keyword.toLowerCase())) {
        score += 3;
        domainEvidence.primaryMatches.push(keyword);
      }
    }
    
    // Secondary keywords (peso 1x)
    for (const keyword of keywords.secondary) {
      if (allText.includes(keyword.toLowerCase())) {
        score += 1;
        domainEvidence.secondaryMatches.push(keyword);
      }
    }
    
    // Section headers (peso 2x)
    for (const section of keywords.sections) {
      if (allText.includes(section.toLowerCase())) {
        score += 2;
        domainEvidence.sectionMatches.push(section);
      }
    }
    
    // Negative keywords (penalità -2x)
    for (const keyword of keywords.negative) {
      if (allText.includes(keyword.toLowerCase())) {
        score -= 2;
        domainEvidence.negativeMatches.push(keyword);
      }
    }
    
    domainScores[domain] = Math.max(0, score); // Non negative
    evidence[domain] = domainEvidence;
  }
  
  // Ordina per score
  const sortedDomains = Object.entries(domainScores)
    .sort(([,a], [,b]) => b - a)
    .filter(([,score]) => score > 0);
  
  if (sortedDomains.length === 0) {
    // Fallback domain - richiede conferma utente
    return {
      domain: SUPPORTED_DOMAINS.SOFTWARE_B2B, // Default più comune
      confidence: 0.1,
      method: "fallback",
      alternative_domains: [],
      requires_user_confirmation: true,
      evidence: {
        primaryMatches: [],
        secondaryMatches: [],
        sectionMatches: [],
        negativeMatches: []
      }
    };
  }
  
  const [topDomain, topScore] = sortedDomains[0];
  const [secondDomain, secondScore] = sortedDomains[1] || [null, 0];
  
  // Calcola confidenza normalizzata
  const maxPossibleScore = Math.max(
    ...Object.values(DOMAIN_KEYWORDS).map(kw => 
      kw.primary.length * 3 + kw.secondary.length * 1 + kw.sections.length * 2
    )
  );
  
  const confidence = Math.min(1.0, topScore / (maxPossibleScore * 0.3)); // 30% del max è confidenza 1.0
  
  // Richiede conferma se confidenza bassa o domini molto vicini
  const requiresConfirmation = confidence < 0.6 || 
    (secondScore > 0 && (topScore - secondScore) / topScore < 0.3);
  
  const alternatives = sortedDomains
    .slice(1, 4) // Top 3 alternative
    .map(([domain, score]) => ({
      domain: domain as Domain,
      confidence: Math.min(1.0, score / (maxPossibleScore * 0.3))
    }));
  
  return {
    domain: topDomain as Domain,
    confidence,
    method: "keyword_analysis",
    alternative_domains: alternatives,
    requires_user_confirmation: requiresConfirmation,
    evidence: evidence[topDomain]
  };
}

/**
 * Classifica dominio da filename se disponibile
 */
export function classifyFromFilename(filename: string): Partial<ClassificationResult> | null {
  const name = filename.toLowerCase();
  
  // Pattern comuni nei nomi file
  const patterns = {
    [SUPPORTED_DOMAINS.SEMICONDUCTORS]: [/datasheet/, /specs?/, /\.pdf$/, /electrical/, /mcu/, /soc/, /adc/, /dac/],
    [SUPPORTED_DOMAINS.NETWORKING]: [/router/, /switch/, /firewall/, /wifi/, /ethernet/, /network/],
    [SUPPORTED_DOMAINS.ENERGY]: [/solar/, /battery/, /inverter/, /ups/, /power/],
    [SUPPORTED_DOMAINS.SOFTWARE_B2B]: [/pricing/, /features/, /saas/, /subscription/],
    [SUPPORTED_DOMAINS.API_SDK]: [/api/, /sdk/, /reference/, /docs?/, /guide/]
  };
  
  for (const [domain, regexes] of Object.entries(patterns)) {
    const matches = regexes.filter(regex => regex.test(name)).length;
    if (matches > 0) {
      return {
        domain: domain as Domain,
        confidence: Math.min(0.8, matches * 0.3),
        method: "filename_analysis"
      };
    }
  }
  
  return null;
}

/**
 * Combina classificazioni da contenuto e filename
 */
export function combineClassifications(
  contentResult: ClassificationResult,
  filenameResult: Partial<ClassificationResult> | null
): ClassificationResult {
  if (!filenameResult) {
    return contentResult;
  }
  
  // Se stesso dominio, aumenta confidenza
  if (contentResult.domain === filenameResult.domain) {
    return {
      ...contentResult,
      confidence: Math.min(1.0, contentResult.confidence + 0.2),
      method: `${contentResult.method}+filename`
    };
  }
  
  // Se domini diversi, usa quello con confidenza maggiore
  const filenameConfidence = filenameResult.confidence || 0;
  if (filenameConfidence > contentResult.confidence) {
    return {
      ...contentResult,
      domain: filenameResult.domain!,
      confidence: filenameConfidence,
      method: "filename_override"
    };
  }
  
  return contentResult;
}