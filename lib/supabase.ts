import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Types for our database schema
export type Database = {
  public: {
    Tables: {
      documents: {
        Row: {
          id: string
          name: string
          file_url: string
          storage_path: string
          size: number
          vendor_name: string | null
          status: 'uploading' | 'uploaded' | 'processing' | 'completed' | 'error'
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          file_url: string
          storage_path: string
          size: number
          vendor_name?: string | null
          status?: 'uploading' | 'uploaded' | 'processing' | 'completed' | 'error'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          file_url?: string
          storage_path?: string
          size?: number
          vendor_name?: string | null
          status?: 'uploading' | 'uploaded' | 'processing' | 'completed' | 'error'
          created_at?: string
          updated_at?: string
        }
      }
      comparison_jobs: {
        Row: {
          id: string
          name: string
          status: 'created' | 'processing' | 'completed' | 'error'
          document_ids: string[]
          results: any | null
          error_message: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          status?: 'created' | 'processing' | 'completed' | 'error'
          document_ids: string[]
          results?: any | null
          error_message?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          status?: 'created' | 'processing' | 'completed' | 'error'
          document_ids?: string[]
          results?: any | null
          error_message?: string | null
          created_at?: string
          updated_at?: string
        }
      }
    }
  }
}