import { supabase } from './supabase'
import type { Database } from './supabase'

type Document = Database['public']['Tables']['documents']['Row']
type DocumentInsert = Database['public']['Tables']['documents']['Insert']
type DocumentUpdate = Database['public']['Tables']['documents']['Update']

type ComparisonJob = Database['public']['Tables']['comparison_jobs']['Row']
type ComparisonJobInsert = Database['public']['Tables']['comparison_jobs']['Insert']
type ComparisonJobUpdate = Database['public']['Tables']['comparison_jobs']['Update']

export class SupabaseService {
  
  // Document operations
  async uploadDocument(file: File, vendorName?: string): Promise<string> {
    try {
      console.log(`Uploading ${file.name} to Supabase storage...`)
      
      // Generate unique filename
      const timestamp = Date.now()
      const cleanName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
      const fileName = `${timestamp}_${cleanName}`
      
      // Upload to Supabase storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('pdfs')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false
        })
      
      if (uploadError) {
        console.error('Storage upload error:', uploadError)
        throw new Error(`Upload failed: ${uploadError.message}`)
      }
      
      console.log('✓ File uploaded to storage:', uploadData.path)
      
      // Get public URL
      const { data: urlData } = supabase.storage
        .from('pdfs')
        .getPublicUrl(uploadData.path)
      
      // Insert document record in database
      const documentData: DocumentInsert = {
        name: file.name,
        file_url: urlData.publicUrl,
        storage_path: uploadData.path,
        size: file.size,
        vendor_name: vendorName || file.name.replace(/\.pdf$/i, ''),
        status: 'uploaded'
      }
      
      const { data: docData, error: docError } = await supabase
        .from('documents')
        .insert(documentData)
        .select()
        .single()
      
      if (docError) {
        console.error('Database insert error:', docError)
        throw new Error(`Database error: ${docError.message}`)
      }
      
      console.log('✓ Document record created:', docData.id)
      return docData.id
      
    } catch (error) {
      console.error('Upload document error:', error)
      throw error
    }
  }
  
  async getDocument(id: string): Promise<Document | null> {
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .eq('id', id)
      .single()
    
    if (error) {
      console.error('Get document error:', error)
      return null
    }
    
    return data
  }
  
  async updateDocument(id: string, updates: DocumentUpdate): Promise<void> {
    const { error } = await supabase
      .from('documents')
      .update(updates)
      .eq('id', id)
    
    if (error) {
      console.error('Update document error:', error)
      throw new Error(`Update failed: ${error.message}`)
    }
  }
  
  async deleteDocument(id: string): Promise<void> {
    // Get document to find storage path
    const document = await this.getDocument(id)
    if (!document) return
    
    // Delete from storage
    const { error: storageError } = await supabase.storage
      .from('pdfs')
      .remove([document.storage_path])
    
    if (storageError) {
      console.warn('Storage delete error:', storageError)
    }
    
    // Delete from database
    const { error } = await supabase
      .from('documents')
      .delete()
      .eq('id', id)
    
    if (error) {
      console.error('Delete document error:', error)
      throw new Error(`Delete failed: ${error.message}`)
    }
  }
  
  // Comparison job operations
  async createComparisonJob(name: string, documentIds: string[]): Promise<string> {
    const jobData: ComparisonJobInsert = {
      name,
      document_ids: documentIds,
      status: 'created'
    }
    
    const { data, error } = await supabase
      .from('comparison_jobs')
      .insert(jobData)
      .select()
      .single()
    
    if (error) {
      console.error('Create job error:', error)
      throw new Error(`Job creation failed: ${error.message}`)
    }
    
    console.log('✓ Comparison job created:', data.id)
    return data.id
  }
  
  async getComparisonJob(id: string): Promise<ComparisonJob | null> {
    const { data, error } = await supabase
      .from('comparison_jobs')
      .select('*')
      .eq('id', id)
      .single()
    
    if (error) {
      console.error('Get job error:', error)
      return null
    }
    
    return data
  }
  
  async updateComparisonJob(id: string, updates: ComparisonJobUpdate): Promise<void> {
    const { error } = await supabase
      .from('comparison_jobs')
      .update(updates)
      .eq('id', id)
    
    if (error) {
      console.error('Update job error:', error)
      throw new Error(`Job update failed: ${error.message}`)
    }
  }
  
  async getComparisonJobWithDocuments(id: string) {
    const job = await this.getComparisonJob(id)
    if (!job) return null
    
    // Get all documents for this job
    const { data: documents, error } = await supabase
      .from('documents')
      .select('*')
      .in('id', job.document_ids)
    
    if (error) {
      console.error('Get job documents error:', error)
      throw new Error(`Failed to get documents: ${error.message}`)
    }
    
    return {
      job,
      documents: documents || []
    }
  }
  
  // Process comparison job with mock data
  async processComparisonJob(jobId: string): Promise<void> {
    console.log('Starting comparison job processing:', jobId)
    
    // Update job status to processing
    await this.updateComparisonJob(jobId, { status: 'processing' })
    
    try {
      const jobData = await this.getComparisonJobWithDocuments(jobId)
      if (!jobData) {
        throw new Error('Job not found')
      }
      
      // Simulate processing time
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      // Generate mock results based on the documents
      const mockResults = this.generateMockResults(jobData.documents)
      
      // Update job with results
      await this.updateComparisonJob(jobId, {
        status: 'completed',
        results: mockResults
      })
      
      console.log('✓ Job processing completed:', jobId)
      
    } catch (error) {
      console.error('Job processing error:', error)
      
      await this.updateComparisonJob(jobId, {
        status: 'error',
        error_message: error instanceof Error ? error.message : 'Unknown error'
      })
      
      throw error
    }
  }
  
  private generateMockResults(documents: Document[]) {
    const vendors = documents.map(doc => doc.vendor_name || doc.name.replace(/\.pdf$/i, ''))
    
    // Generate mock comparison table similar to the existing system
    const columns = [
      { id: 'throughput', label: 'Throughput (req/s)', unit: 'req/s', better: 'up' },
      { id: 'uptime_sla', label: 'Uptime SLA (%)', unit: '%', better: 'up' },
      { id: 'monthly_price', label: 'Monthly Price ($)', unit: 'USD', better: 'down' },
      { id: 'support_response', label: 'Support Response (hrs)', unit: 'hours', better: 'down' },
      { id: 'soc2', label: 'SOC2', unit: 'boolean', better: 'up' },
      { id: 'gdpr', label: 'GDPR', unit: 'boolean', better: 'up' }
    ]
    
    const rows = documents.map((doc, index) => {
      // Generate different profiles based on document index
      const profile = index % 3 === 0 ? 'high' : index % 3 === 1 ? 'balanced' : 'budget'
      
      const cells: Record<string, any> = {}
      
      columns.forEach(column => {
        let value: any
        let confidence = 0.8 + Math.random() * 0.2 // 0.8-1.0
        
        switch (column.id) {
          case 'throughput':
            value = profile === 'high' ? 2000 + Math.random() * 500 :
                    profile === 'balanced' ? 1200 + Math.random() * 300 :
                    700 + Math.random() * 200
            break
          case 'uptime_sla':
            value = profile === 'high' ? 99.99 :
                    profile === 'balanced' ? 99.9 :
                    99.5 + Math.random() * 0.4
            break
          case 'monthly_price':
            value = profile === 'high' ? 199 + Math.random() * 50 :
                    profile === 'balanced' ? 99 + Math.random() * 20 :
                    49 + Math.random() * 10
            break
          case 'support_response':
            value = profile === 'high' ? 2 + Math.random() * 2 :
                    profile === 'balanced' ? 8 + Math.random() * 4 :
                    24 + Math.random() * 12
            break
          case 'soc2':
            value = profile === 'budget' ? Math.random() > 0.5 : true
            break
          case 'gdpr':
            value = true
            break
          default:
            value = null
        }
        
        cells[column.id] = {
          value: Math.round(value * 100) / 100, // Round to 2 decimals
          unit: column.unit,
          confidence,
          provenanceRef: `${doc.id}:page-1:mock`,
          flags: []
        }
      })
      
      return {
        documentId: doc.id,
        cells
      }
    })
    
    return {
      columns,
      rows,
      highlights: [],
      exports: null
    }
  }
  
  // List recent jobs
  async listRecentJobs(limit: number = 10): Promise<ComparisonJob[]> {
    const { data, error } = await supabase
      .from('comparison_jobs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit)
    
    if (error) {
      console.error('List jobs error:', error)
      throw new Error(`Failed to list jobs: ${error.message}`)
    }
    
    return data || []
  }
}

// Export singleton instance
export const supabaseService = new SupabaseService()