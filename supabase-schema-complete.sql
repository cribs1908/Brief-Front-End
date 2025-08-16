-- Complete Schema Implementation for newintegration.md
-- Based on the detailed architecture specification

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create workspaces table first (referenced by others)
CREATE TABLE workspaces (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  plan TEXT DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'enterprise')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create jobs table (core orchestration)
CREATE TABLE jobs (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'CREATED' CHECK (status IN ('CREATED', 'UPLOADED', 'CLASSIFYING', 'CLASSIFIED', 'PARSING', 'PARSED', 'EXTRACTING', 'EXTRACTED', 'NORMALIZING', 'NORMALIZED', 'BUILDING', 'BUILT', 'READY', 'FAILED', 'PARTIAL', 'CANCELLED')),
  domain TEXT, -- auto-detected or forced
  domain_mode TEXT DEFAULT 'auto' CHECK (domain_mode IN ('auto', 'forced')),
  profile_version TEXT,
  synonym_snapshot TEXT,
  metrics JSONB DEFAULT '{}', -- {latency_ms, pages_total, ocr_pages, cost_estimate}
  error TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create documents table
CREATE TABLE documents (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  hash TEXT NOT NULL,
  pages INTEGER,
  storage_path TEXT NOT NULL, -- Supabase Storage path
  storage_url TEXT, -- Full URL for access
  mime TEXT DEFAULT 'application/pdf',
  quality_score DECIMAL(3,2), -- 0.00-1.00
  domain_candidate TEXT, -- auto-detected domain
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create artifacts table (parsed content per page)
CREATE TABLE artifacts (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  page INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('table', 'ocr_text', 'layout', 'text')),
  payload JSONB NOT NULL, -- structured content
  bbox_map JSONB, -- bounding boxes for visual highlighting
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create extractions_raw table (LangChain output)
CREATE TABLE extractions_raw (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  field_id TEXT NOT NULL,
  field_label TEXT NOT NULL,
  value_raw TEXT NOT NULL,
  unit_raw TEXT,
  source JSONB NOT NULL, -- {page, bbox, method}
  confidence DECIMAL(3,2) NOT NULL, -- 0.00-1.00
  candidates JSONB DEFAULT '[]',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create extractions_norm table (normalized values)
CREATE TABLE extractions_norm (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  field_id TEXT NOT NULL,
  value_normalized JSONB, -- can be number, string, boolean
  unit TEXT,
  note TEXT, -- calculation notes
  flags TEXT[] DEFAULT '{}', -- ['needs_review', 'out_of_bounds', 'unit_converted']
  provenance_ref TEXT NOT NULL,
  confidence DECIMAL(3,2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create results table (final comparison table)
CREATE TABLE results (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
  columns JSONB NOT NULL, -- [{id, label, unit, better}]
  rows JSONB NOT NULL, -- [{document_id, cells: {field_id: {value, unit, confidence, provenance_ref, flags}}}]
  highlights JSONB DEFAULT '[]',
  exports JSONB DEFAULT '{}', -- {csv_url, xlsx_url, json_url}
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create profiles table (domain-specific extraction configurations)
CREATE TABLE profiles (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  domain TEXT NOT NULL,
  version TEXT NOT NULL,
  schema JSONB NOT NULL, -- field definitions
  synonyms JSONB DEFAULT '{}', -- seed synonyms
  unit_targets JSONB DEFAULT '{}', -- field_id -> target_unit
  rules JSONB DEFAULT '{}', -- ranges, priorities, bounds, canonical_maps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(domain, version)
);

-- Create global synonyms table
CREATE TABLE synonyms_global (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  field_id TEXT NOT NULL,
  domain TEXT NOT NULL,
  canonical TEXT NOT NULL,
  variants JSONB NOT NULL, -- [{label, lang, score}]
  blacklist TEXT[] DEFAULT '{}',
  version TEXT NOT NULL,
  locked BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create workspace-specific synonyms table
CREATE TABLE synonyms_workspace (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  field_id TEXT NOT NULL,
  domain TEXT NOT NULL,
  canonical TEXT NOT NULL,
  variants JSONB NOT NULL,
  source TEXT DEFAULT 'auto' CHECK (source IN ('auto', 'curated')),
  score DECIMAL(3,2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create synonym events table (for learning)
CREATE TABLE synonym_events (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('match_success', 'override_applied', 'candidate_seen')),
  field_id TEXT NOT NULL,
  domain TEXT NOT NULL,
  label TEXT NOT NULL,
  confidence DECIMAL(3,2),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create overrides table (user corrections)
CREATE TABLE overrides (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  result_id UUID REFERENCES results(id) ON DELETE CASCADE,
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  field_id TEXT NOT NULL,
  value_original JSONB,
  unit_original TEXT,
  value_corrected JSONB NOT NULL,
  unit_corrected TEXT,
  user_id TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create audit logs table
CREATE TABLE audit_logs (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create billing/limits table
CREATE TABLE billing (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  plan TEXT NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'suspended')),
  period_start TIMESTAMP WITH TIME ZONE,
  period_end TIMESTAMP WITH TIME ZONE,
  seats INTEGER DEFAULT 1,
  usage_current JSONB DEFAULT '{}', -- current period usage
  limits JSONB DEFAULT '{}', -- plan limits
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_jobs_workspace_id ON jobs(workspace_id);
CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_documents_job_id ON documents(job_id);
CREATE INDEX idx_documents_hash ON documents(hash);
CREATE INDEX idx_artifacts_document_id ON artifacts(document_id);
CREATE INDEX idx_artifacts_document_page ON artifacts(document_id, page);
CREATE INDEX idx_extractions_raw_document_id ON extractions_raw(document_id);
CREATE INDEX idx_extractions_norm_document_id ON extractions_norm(document_id);
CREATE INDEX idx_results_job_id ON results(job_id);
CREATE INDEX idx_profiles_domain_version ON profiles(domain, version);
CREATE INDEX idx_synonyms_global_field_domain ON synonyms_global(field_id, domain);
CREATE INDEX idx_synonyms_workspace_workspace_field ON synonyms_workspace(workspace_id, field_id, domain);
CREATE INDEX idx_overrides_result_id ON overrides(result_id);
CREATE INDEX idx_audit_logs_workspace_id ON audit_logs(workspace_id);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_workspaces_updated_at BEFORE UPDATE ON workspaces
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_jobs_updated_at BEFORE UPDATE ON jobs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_documents_updated_at BEFORE UPDATE ON documents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_synonyms_global_updated_at BEFORE UPDATE ON synonyms_global
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_synonyms_workspace_updated_at BEFORE UPDATE ON synonyms_workspace
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_billing_updated_at BEFORE UPDATE ON billing
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security (RLS)
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE extractions_raw ENABLE ROW LEVEL SECURITY;
ALTER TABLE extractions_norm ENABLE ROW LEVEL SECURITY;
ALTER TABLE results ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE synonyms_global ENABLE ROW LEVEL SECURITY;
ALTER TABLE synonyms_workspace ENABLE ROW LEVEL SECURITY;
ALTER TABLE synonym_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (for now, allow all - implement proper auth later)
CREATE POLICY "Allow all operations on workspaces" ON workspaces FOR ALL USING (true);
CREATE POLICY "Allow all operations on jobs" ON jobs FOR ALL USING (true);
CREATE POLICY "Allow all operations on documents" ON documents FOR ALL USING (true);
CREATE POLICY "Allow all operations on artifacts" ON artifacts FOR ALL USING (true);
CREATE POLICY "Allow all operations on extractions_raw" ON extractions_raw FOR ALL USING (true);
CREATE POLICY "Allow all operations on extractions_norm" ON extractions_norm FOR ALL USING (true);
CREATE POLICY "Allow all operations on results" ON results FOR ALL USING (true);
CREATE POLICY "Allow all operations on profiles" ON profiles FOR ALL USING (true);
CREATE POLICY "Allow all operations on synonyms_global" ON synonyms_global FOR ALL USING (true);
CREATE POLICY "Allow all operations on synonyms_workspace" ON synonyms_workspace FOR ALL USING (true);
CREATE POLICY "Allow all operations on synonym_events" ON synonym_events FOR ALL USING (true);
CREATE POLICY "Allow all operations on overrides" ON overrides FOR ALL USING (true);
CREATE POLICY "Allow all operations on audit_logs" ON audit_logs FOR ALL USING (true);
CREATE POLICY "Allow all operations on billing" ON billing FOR ALL USING (true);

-- Create storage bucket for PDF files
INSERT INTO storage.buckets (id, name, public) VALUES ('pdfs', 'pdfs', false);
INSERT INTO storage.buckets (id, name, public) VALUES ('exports', 'exports', false);

-- Create policies for storage buckets
CREATE POLICY "Allow authenticated uploads to pdfs bucket" ON storage.objects
    FOR ALL USING (bucket_id = 'pdfs');

CREATE POLICY "Allow authenticated access to exports bucket" ON storage.objects
    FOR ALL USING (bucket_id = 'exports');

-- Insert default workspace for development
INSERT INTO workspaces (id, name, owner_id, plan) 
VALUES ('00000000-0000-0000-0000-000000000001', 'Default Workspace', 'default_user', 'pro');

-- Insert sample domain profiles
INSERT INTO profiles (domain, version, schema, synonyms, unit_targets, rules) VALUES 
('semiconductors', '1.0', 
  '{
    "fields": [
      {"field": "model", "type": "text", "required": true, "display_label": "Model"},
      {"field": "power_consumption", "type": "numeric", "required": true, "display_label": "Power Consumption", "unit": "mW"},
      {"field": "voltage_supply", "type": "numeric", "required": true, "display_label": "Supply Voltage", "unit": "V"},
      {"field": "frequency_max", "type": "numeric", "required": false, "display_label": "Max Frequency", "unit": "MHz"},
      {"field": "temperature_range", "type": "range", "required": false, "display_label": "Temperature Range", "unit": "°C"},
      {"field": "package_type", "type": "text", "required": false, "display_label": "Package"},
      {"field": "interfaces", "type": "list", "required": false, "display_label": "Interfaces"},
      {"field": "certifications", "type": "list", "required": false, "display_label": "Certifications"}
    ]
  }',
  '{
    "model": ["part number", "model number", "device"],
    "power_consumption": ["power", "current consumption", "supply current", "icc"],
    "voltage_supply": ["vdd", "vcc", "supply voltage", "operating voltage"],
    "frequency_max": ["max frequency", "clock speed", "operating frequency"],
    "temperature_range": ["operating temperature", "temp range", "ambient temperature"],
    "package_type": ["package", "form factor", "enclosure"],
    "interfaces": ["communication", "protocols", "bus"],
    "certifications": ["compliance", "standards", "approvals"]
  }',
  '{
    "power_consumption": "mW",
    "voltage_supply": "V", 
    "frequency_max": "MHz",
    "temperature_range": "°C"
  }',
  '{
    "ranges": {"temperature_range": {"min": -40, "max": 125}},
    "bounds": {"power_consumption": {"min": 0, "max": 10000}, "voltage_supply": {"min": 0, "max": 50}}
  }'
),
('api_sdk', '1.0',
  '{
    "fields": [
      {"field": "name", "type": "text", "required": true, "display_label": "API Name"},
      {"field": "version", "type": "text", "required": true, "display_label": "Version"},
      {"field": "authentication", "type": "list", "required": true, "display_label": "Authentication"},
      {"field": "rate_limit", "type": "numeric", "required": false, "display_label": "Rate Limit", "unit": "req/s"},
      {"field": "latency_p95", "type": "numeric", "required": false, "display_label": "Latency P95", "unit": "ms"},
      {"field": "sla_uptime", "type": "numeric", "required": false, "display_label": "SLA Uptime", "unit": "%"},
      {"field": "regions", "type": "list", "required": false, "display_label": "Regions"},
      {"field": "pricing_model", "type": "text", "required": false, "display_label": "Pricing Model"}
    ]
  }',
  '{
    "name": ["api name", "service name", "endpoint"],
    "version": ["api version", "v", "release"],
    "authentication": ["auth", "security", "api key", "oauth", "jwt"],
    "rate_limit": ["rate limit", "throttling", "requests per second", "rps"],
    "latency_p95": ["latency", "response time", "p95", "95th percentile"],
    "sla_uptime": ["uptime", "availability", "sla", "service level"],
    "regions": ["data centers", "locations", "zones"],
    "pricing_model": ["pricing", "billing", "cost model"]
  }',
  '{
    "rate_limit": "req/s",
    "latency_p95": "ms",
    "sla_uptime": "%"
  }',
  '{
    "bounds": {"rate_limit": {"min": 0, "max": 100000}, "latency_p95": {"min": 0, "max": 10000}, "sla_uptime": {"min": 90, "max": 100}}
  }'
);

-- Insert sample global synonyms
INSERT INTO synonyms_global (field_id, domain, canonical, variants, version) VALUES 
('power_consumption', 'semiconductors', 'Power Consumption', 
  '[
    {"label": "power", "lang": "en", "score": 0.9},
    {"label": "current consumption", "lang": "en", "score": 0.85},
    {"label": "supply current", "lang": "en", "score": 0.8},
    {"label": "icc", "lang": "en", "score": 0.95},
    {"label": "potenza", "lang": "it", "score": 0.9},
    {"label": "consommation", "lang": "fr", "score": 0.9}
  ]', '1.0'),
('rate_limit', 'api_sdk', 'Rate Limit',
  '[
    {"label": "rate limit", "lang": "en", "score": 1.0},
    {"label": "throttling", "lang": "en", "score": 0.8},
    {"label": "requests per second", "lang": "en", "score": 0.9},
    {"label": "rps", "lang": "en", "score": 0.95},
    {"label": "limite de taux", "lang": "fr", "score": 0.9}
  ]', '1.0');