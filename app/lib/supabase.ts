import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Types for complete database schema based on newintegration.md
export type Database = {
  public: {
    Tables: {
      workspaces: {
        Row: {
          id: string
          name: string
          owner_id: string
          plan: 'free' | 'pro' | 'enterprise'
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          owner_id: string
          plan?: 'free' | 'pro' | 'enterprise'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          owner_id?: string
          plan?: 'free' | 'pro' | 'enterprise'
          created_at?: string
          updated_at?: string
        }
      }
      jobs: {
        Row: {
          id: string
          workspace_id: string
          status: 'CREATED' | 'UPLOADED' | 'CLASSIFYING' | 'CLASSIFIED' | 'PARSING' | 'PARSED' | 'EXTRACTING' | 'EXTRACTED' | 'NORMALIZING' | 'NORMALIZED' | 'BUILDING' | 'BUILT' | 'READY' | 'FAILED' | 'PARTIAL' | 'CANCELLED'
          domain: string | null
          domain_mode: 'auto' | 'forced'
          profile_version: string | null
          synonym_snapshot: string | null
          metrics: any
          error: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          status?: string
          domain?: string | null
          domain_mode?: 'auto' | 'forced'
          profile_version?: string | null
          synonym_snapshot?: string | null
          metrics?: any
          error?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string
          status?: string
          domain?: string | null
          domain_mode?: 'auto' | 'forced'
          profile_version?: string | null
          synonym_snapshot?: string | null
          metrics?: any
          error?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      documents: {
        Row: {
          id: string
          job_id: string
          filename: string
          hash: string
          pages: number | null
          storage_path: string
          storage_url: string | null
          mime: string
          quality_score: number | null
          domain_candidate: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          job_id: string
          filename: string
          hash: string
          pages?: number | null
          storage_path: string
          storage_url?: string | null
          mime?: string
          quality_score?: number | null
          domain_candidate?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          job_id?: string
          filename?: string
          hash?: string
          pages?: number | null
          storage_path?: string
          storage_url?: string | null
          mime?: string
          quality_score?: number | null
          domain_candidate?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      artifacts: {
        Row: {
          id: string
          document_id: string
          page: number
          type: 'table' | 'ocr_text' | 'layout' | 'text'
          payload: any
          bbox_map: any | null
          created_at: string
        }
        Insert: {
          id?: string
          document_id: string
          page: number
          type: 'table' | 'ocr_text' | 'layout' | 'text'
          payload: any
          bbox_map?: any | null
          created_at?: string
        }
        Update: {
          id?: string
          document_id?: string
          page?: number
          type?: 'table' | 'ocr_text' | 'layout' | 'text'
          payload?: any
          bbox_map?: any | null
          created_at?: string
        }
      }
      extractions_raw: {
        Row: {
          id: string
          document_id: string
          field_id: string
          field_label: string
          value_raw: string
          unit_raw: string | null
          source: any
          confidence: number
          candidates: any
          created_at: string
        }
        Insert: {
          id?: string
          document_id: string
          field_id: string
          field_label: string
          value_raw: string
          unit_raw?: string | null
          source: any
          confidence: number
          candidates?: any
          created_at?: string
        }
        Update: {
          id?: string
          document_id?: string
          field_id?: string
          field_label?: string
          value_raw?: string
          unit_raw?: string | null
          source?: any
          confidence?: number
          candidates?: any
          created_at?: string
        }
      }
      extractions_norm: {
        Row: {
          id: string
          document_id: string
          field_id: string
          value_normalized: any | null
          unit: string | null
          note: string | null
          flags: string[]
          provenance_ref: string
          confidence: number
          created_at: string
        }
        Insert: {
          id?: string
          document_id: string
          field_id: string
          value_normalized?: any | null
          unit?: string | null
          note?: string | null
          flags?: string[]
          provenance_ref: string
          confidence: number
          created_at?: string
        }
        Update: {
          id?: string
          document_id?: string
          field_id?: string
          value_normalized?: any | null
          unit?: string | null
          note?: string | null
          flags?: string[]
          provenance_ref?: string
          confidence?: number
          created_at?: string
        }
      }
      results: {
        Row: {
          id: string
          job_id: string
          columns: any
          rows: any
          highlights: any
          exports: any
          created_at: string
        }
        Insert: {
          id?: string
          job_id: string
          columns: any
          rows: any
          highlights?: any
          exports?: any
          created_at?: string
        }
        Update: {
          id?: string
          job_id?: string
          columns?: any
          rows?: any
          highlights?: any
          exports?: any
          created_at?: string
        }
      }
      profiles: {
        Row: {
          id: string
          domain: string
          version: string
          schema: any
          synonyms: any
          unit_targets: any
          rules: any
          created_at: string
        }
        Insert: {
          id?: string
          domain: string
          version: string
          schema: any
          synonyms?: any
          unit_targets?: any
          rules?: any
          created_at?: string
        }
        Update: {
          id?: string
          domain?: string
          version?: string
          schema?: any
          synonyms?: any
          unit_targets?: any
          rules?: any
          created_at?: string
        }
      }
    }
  }
}