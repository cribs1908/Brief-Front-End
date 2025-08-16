/**
 * API Gateway / Orchestratore
 * Implements the orchestration layer from newintegration.md
 * Coordinates async tasks and manages job state transitions
 */

import { supabase } from './supabase';
import type { Database } from './supabase';

type Job = Database['public']['Tables']['jobs']['Row'];
type Document = Database['public']['Tables']['documents']['Row'];
type WorkspaceId = string;

const DEFAULT_WORKSPACE_ID = '00000000-0000-0000-0000-000000000001';

export class APIGateway {
  
  /**
   * 1. Create Job - POST /jobs.create
   * Creates job and generates signed upload URLs
   */
  async createJob(params: {
    workspaceId?: WorkspaceId;
    domainMode?: 'auto' | 'forced';
    domain?: string;
    fileCount: number;
  }) {
    console.log('🚀 Creating job with params:', params);
    
    const workspaceId = params.workspaceId || DEFAULT_WORKSPACE_ID;
    
    // Ensure default workspace exists
    await this.ensureDefaultWorkspace();
    
    // Create job record
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .insert({
        workspace_id: workspaceId,
        status: 'CREATED',
        domain_mode: params.domainMode || 'auto',
        domain: params.domain || null,
        metrics: { latency_ms: null, pages_total: 0, ocr_pages: 0, cost_estimate: 0 }
      })
      .select()
      .single();
    
    if (jobError) {
      console.error('Failed to create job:', jobError);
      throw new Error(`Job creation failed: ${jobError.message}`);
    }
    
    // Generate signed upload URLs for each file
    const uploadUrls: { filename: string; url: string; path: string }[] = [];
    
    for (let i = 0; i < params.fileCount; i++) {
      const timestamp = Date.now();
      const filename = `${job.id}_file_${i}_${timestamp}.pdf`;
      const path = `jobs/${job.id}/${filename}`;
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('pdfs')
        .createSignedUploadUrl(path);
      
      if (uploadError) {
        console.error('Failed to create upload URL:', uploadError);
        continue;
      }
      
      uploadUrls.push({
        filename: filename,
        url: uploadData.signedUrl,
        path: path
      });
    }
    
    console.log('✅ Job created:', job.id, 'with', uploadUrls.length, 'upload URLs');
    
    return {
      job_id: job.id,
      upload_urls: uploadUrls,
      status: job.status
    };
  }
  
  /**
   * 2. Complete Upload - POST /jobs.completeUpload
   * Registers uploaded documents and transitions to UPLOADED
   */
  async completeUpload(params: {
    jobId: string;
    files: Array<{
      originalName: string;
      storagePath: string;
      size: number;
    }>;
  }) {
    console.log('📤 Completing upload for job:', params.jobId);
    
    const { jobId, files } = params;
    
    // Create document records
    const documents = [];
    
    for (const file of files) {
      const hash = `${file.originalName}-${file.size}-${Date.now()}`;
      
      // Get public URL for the uploaded file
      const { data: urlData } = supabase.storage
        .from('pdfs')
        .getPublicUrl(file.storagePath);
      
      const { data: doc, error: docError } = await supabase
        .from('documents')
        .insert({
          job_id: jobId,
          filename: file.originalName,
          hash,
          storage_path: file.storagePath,
          storage_url: urlData.publicUrl,
          mime: 'application/pdf'
        })
        .select()
        .single();
      
      if (docError) {
        console.error('Failed to create document record:', docError);
        continue;
      }
      
      documents.push(doc);
    }
    
    // Update job status to UPLOADED
    const { error: updateError } = await supabase
      .from('jobs')
      .update({ status: 'UPLOADED' })
      .eq('id', jobId);
    
    if (updateError) {
      console.error('Failed to update job status:', updateError);
      throw new Error(`Status update failed: ${updateError.message}`);
    }
    
    console.log('✅ Upload completed for job:', jobId, 'with', documents.length, 'documents');
    
    // Start async processing
    this.startAsyncProcessing(jobId);
    
    return {
      status: 'UPLOADED',
      documents: documents.map(d => ({ id: d.id, filename: d.filename }))
    };
  }
  
  /**
   * 3. Get Job Status - GET /jobs.events (simplified)
   * Returns current job status and progress
   */
  async getJobStatus(jobId: string) {
    console.log('📊 Getting status for job:', jobId);
    
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select(`
        *,
        documents:documents(count)
      `)
      .eq('id', jobId)
      .single();
    
    if (jobError) {
      console.error('Failed to get job status:', jobError);
      throw new Error(`Status fetch failed: ${jobError.message}`);
    }
    
    return {
      job_id: jobId,
      status: job.status,
      domain: job.domain,
      metrics: job.metrics,
      error: job.error,
      progress: this.calculateProgress(job.status),
      documents_count: (job.documents as any)?.[0]?.count || 0
    };
  }
  
  /**
   * 4. Get Job Results - GET /jobs.result
   * Returns final comparison table results
   */
  async getJobResults(jobId: string) {
    console.log('📊 Getting results for job:', jobId);
    
    const { data: results, error: resultsError } = await supabase
      .from('results')
      .select('*')
      .eq('job_id', jobId)
      .single();
    
    if (resultsError) {
      console.error('Failed to get job results:', resultsError);
      
      // Return empty structure if no results yet
      return {
        job_id: jobId,
        domain: null,
        columns: [],
        rows: [],
        highlights: [],
        exports: null
      };
    }
    
    return {
      job_id: jobId,
      domain: results.columns?.[0]?.domain || null,
      columns: results.columns || [],
      rows: results.rows || [],
      highlights: results.highlights || [],
      exports: results.exports || null
    };
  }
  
  /**
   * 5. Start Async Processing Pipeline
   * Coordinates the full processing pipeline per newintegration.md
   */
  private async startAsyncProcessing(jobId: string) {
    console.log('🔄 Starting async processing for job:', jobId);
    
    try {
      // Phase 1: Classification
      await this.runClassification(jobId);
      
      // Phase 2: Parsing
      await this.runParsing(jobId);
      
      // Phase 3: Extraction
      await this.runExtraction(jobId);
      
      // Phase 4: Normalization
      await this.runNormalization(jobId);
      
      // Phase 5: Build Results
      await this.runResultsBuilder(jobId);
      
      console.log('✅ Processing completed for job:', jobId);
      
    } catch (error) {
      console.error('❌ Processing failed for job:', jobId, error);
      
      await supabase
        .from('jobs')
        .update({ 
          status: 'FAILED', 
          error: error instanceof Error ? error.message : 'Unknown processing error' 
        })
        .eq('id', jobId);
    }
  }
  
  /**
   * Phase 1: Domain Classification
   */
  private async runClassification(jobId: string) {
    console.log('🏷️ Running classification for job:', jobId);
    
    await this.updateJobStatus(jobId, 'CLASSIFYING');
    
    // Get documents for this job
    const { data: documents } = await supabase
      .from('documents')
      .select('*')
      .eq('job_id', jobId);
    
    if (!documents?.length) {
      throw new Error('No documents found for classification');
    }
    
    // Simple heuristic classification based on filename
    let detectedDomain = 'semiconductors'; // default
    
    for (const doc of documents) {
      const filename = doc.filename.toLowerCase();
      
      if (filename.includes('api') || filename.includes('endpoint') || filename.includes('rest')) {
        detectedDomain = 'api_sdk';
        break;
      } else if (filename.includes('chip') || filename.includes('ic') || filename.includes('processor')) {
        detectedDomain = 'semiconductors';
        break;
      }
    }
    
    // Update job with detected domain
    await supabase
      .from('jobs')
      .update({ 
        domain: detectedDomain,
        profile_version: '1.0'
      })
      .eq('id', jobId);
    
    await this.updateJobStatus(jobId, 'CLASSIFIED');
    console.log('✅ Classification completed, domain:', detectedDomain);
  }
  
  /**
   * Phase 2: PDF Parsing (Tabula + OCR)
   */
  private async runParsing(jobId: string) {
    console.log('📖 Running parsing for job:', jobId);
    
    await this.updateJobStatus(jobId, 'PARSING');
    
    // Get documents for this job
    const { data: documents } = await supabase
      .from('documents')
      .select('*')
      .eq('job_id', jobId);
    
    if (!documents?.length) {
      throw new Error('No documents found for parsing');
    }
    
    let totalPages = 0;
    
    // For each document, create mock parsing artifacts
    for (const doc of documents) {
      const mockPages = Math.floor(Math.random() * 5) + 3; // 3-7 pages
      totalPages += mockPages;
      
      // Update document with page count
      await supabase
        .from('documents')
        .update({ pages: mockPages, quality_score: 0.95 })
        .eq('id', doc.id);
      
      // Create mock artifacts for each page
      for (let page = 1; page <= mockPages; page++) {
        // Create table artifact
        await supabase
          .from('artifacts')
          .insert({
            document_id: doc.id,
            page,
            type: 'table',
            payload: {
              tables: [{
                headers: ['Parameter', 'Value', 'Unit', 'Condition'],
                rows: [
                  ['Supply Voltage', '3.3', 'V', 'Typical'],
                  ['Current Consumption', '45', 'mA', 'Active Mode'],
                  ['Operating Temperature', '-40 to +85', '°C', 'Full Range']
                ]
              }]
            },
            bbox_map: {
              table_0: { x: 100, y: 200, width: 400, height: 150 }
            }
          });
        
        // Create text artifact
        await supabase
          .from('artifacts')
          .insert({
            document_id: doc.id,
            page,
            type: 'text',
            payload: {
              text_blocks: [
                { text: `${doc.filename.replace('.pdf', '')} Specifications`, page, section: 'header' },
                { text: 'Technical specifications and electrical characteristics', page, section: 'body' }
              ]
            }
          });
      }
    }
    
    // Update job metrics
    await supabase
      .from('jobs')
      .update({ 
        metrics: { latency_ms: null, pages_total: totalPages, ocr_pages: 0, cost_estimate: 0.05 * totalPages }
      })
      .eq('id', jobId);
    
    await this.updateJobStatus(jobId, 'PARSED');
    console.log('✅ Parsing completed, total pages:', totalPages);
  }
  
  /**
   * Phase 3: LangChain Extraction
   */
  private async runExtraction(jobId: string) {
    console.log('🧠 Running extraction for job:', jobId);
    
    await this.updateJobStatus(jobId, 'EXTRACTING');
    
    // Get job and documents
    const { data: job } = await supabase
      .from('jobs')
      .select('*, documents(*)')
      .eq('id', jobId)
      .single();
    
    if (!job) {
      throw new Error('Job not found for extraction');
    }
    
    // Ensure domain profiles exist
    await this.ensureDefaultProfiles();
    
    // Get domain profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('domain', job.domain)
      .eq('version', job.profile_version)
      .single();
    
    if (!profile) {
      throw new Error(`Profile not found for domain: ${job.domain}`);
    }
    
    const fields = profile.schema.fields;
    const documents = job.documents as any[] || [];
    
    // Extract data for each document
    for (const doc of documents) {
      for (const field of fields) {
        // Mock extraction based on field type
        let value_raw = '';
        let unit_raw = null;
        let confidence = 0.8 + Math.random() * 0.2; // 0.8-1.0
        
        switch (field.field) {
          case 'model':
            value_raw = doc.filename.replace('.pdf', '').replace(/[^a-zA-Z0-9]/g, '');
            break;
          case 'power_consumption':
            value_raw = (Math.random() * 100 + 50).toFixed(1);
            unit_raw = 'mW';
            break;
          case 'voltage_supply':
            value_raw = (Math.random() * 2 + 3).toFixed(1);
            unit_raw = 'V';
            break;
          case 'frequency_max':
            value_raw = (Math.random() * 100 + 100).toFixed(0);
            unit_raw = 'MHz';
            break;
          case 'temperature_range':
            value_raw = '-40 to +85';
            unit_raw = '°C';
            break;
          case 'name':
            value_raw = doc.filename.replace('.pdf', '') + ' API';
            break;
          case 'version':
            value_raw = 'v' + (Math.floor(Math.random() * 3) + 1) + '.0';
            break;
          case 'rate_limit':
            value_raw = (Math.random() * 1000 + 100).toFixed(0);
            unit_raw = 'req/s';
            break;
          case 'latency_p95':
            value_raw = (Math.random() * 100 + 50).toFixed(0);
            unit_raw = 'ms';
            break;
          case 'sla_uptime':
            value_raw = (99.5 + Math.random() * 0.5).toFixed(2);
            unit_raw = '%';
            break;
          default:
            value_raw = 'N/A';
            confidence = 0.1;
        }
        
        // Insert raw extraction
        await supabase
          .from('extractions_raw')
          .insert({
            document_id: doc.id,
            field_id: field.field,
            field_label: field.display_label,
            value_raw,
            unit_raw,
            source: { page: 1, bbox: { x: 100, y: 200, width: 200, height: 20 }, method: 'langchain' },
            confidence,
            candidates: []
          });
      }
    }
    
    await this.updateJobStatus(jobId, 'EXTRACTED');
    console.log('✅ Extraction completed');
  }
  
  /**
   * Phase 4: Normalization
   */
  private async runNormalization(jobId: string) {
    console.log('⚖️ Running normalization for job:', jobId);
    
    await this.updateJobStatus(jobId, 'NORMALIZING');
    
    // Get raw extractions
    const { data: rawExtractions } = await supabase
      .from('extractions_raw')
      .select('*, documents!inner(job_id)')
      .eq('documents.job_id', jobId);
    
    if (!rawExtractions?.length) {
      throw new Error('No raw extractions found for normalization');
    }
    
    // Normalize each extraction
    for (const extraction of rawExtractions) {
      let value_normalized: any = extraction.value_raw;
      let unit = extraction.unit_raw;
      let note = null;
      let flags: string[] = [];
      
      // Normalize numeric values
      if (extraction.unit_raw && !isNaN(parseFloat(extraction.value_raw))) {
        value_normalized = parseFloat(extraction.value_raw);
        
        // Unit conversions
        if (extraction.unit_raw === 'mW' && extraction.field_id === 'power_consumption') {
          // Keep as mW (target unit)
          unit = 'mW';
        } else if (extraction.unit_raw === 'V' && extraction.field_id === 'voltage_supply') {
          // Keep as V (target unit)
          unit = 'V';
        } else if (extraction.unit_raw === 'MHz' && extraction.field_id === 'frequency_max') {
          // Keep as MHz (target unit)
          unit = 'MHz';
        }
        
        // Add bounds checking flags
        if (extraction.field_id === 'power_consumption' && value_normalized > 1000) {
          flags.push('out_of_bounds');
        }
        if (extraction.field_id === 'voltage_supply' && (value_normalized < 1 || value_normalized > 6)) {
          flags.push('needs_review');
        }
      }
      
      // Handle ranges
      if (extraction.value_raw.includes(' to ')) {
        const parts = extraction.value_raw.split(' to ');
        if (parts.length === 2) {
          value_normalized = {
            min: parseFloat(parts[0]),
            max: parseFloat(parts[1])
          };
          note = `Range: ${extraction.value_raw}`;
        }
      }
      
      // Handle text values
      if (extraction.field_id === 'model' || extraction.field_id === 'name' || extraction.field_id === 'version') {
        value_normalized = extraction.value_raw;
        unit = null;
      }
      
      // Insert normalized extraction
      await supabase
        .from('extractions_norm')
        .insert({
          document_id: extraction.document_id,
          field_id: extraction.field_id,
          value_normalized,
          unit,
          note,
          flags,
          provenance_ref: `${extraction.document_id}:${extraction.source.page}:langchain`,
          confidence: Math.min(extraction.confidence, flags.includes('out_of_bounds') ? 0.5 : 1.0)
        });
    }
    
    await this.updateJobStatus(jobId, 'NORMALIZED');
    console.log('✅ Normalization completed');
  }
  
  /**
   * Phase 5: Build Comparison Results
   */
  private async runResultsBuilder(jobId: string) {
    console.log('🏗️ Building results for job:', jobId);
    
    await this.updateJobStatus(jobId, 'BUILDING');
    
    // Get job, documents, and normalized extractions
    const { data: job } = await supabase
      .from('jobs')
      .select('*, documents(*)')
      .eq('id', jobId)
      .single();
    
    if (!job) {
      throw new Error('Job not found for results building');
    }
    
    const { data: extractions } = await supabase
      .from('extractions_norm')
      .select('*, documents!inner(job_id, filename)')
      .eq('documents.job_id', jobId);
    
    if (!extractions?.length) {
      throw new Error('No normalized extractions found');
    }
    
    // Get domain profile for column definitions
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('domain', job.domain)
      .eq('version', job.profile_version)
      .single();
    
    if (!profile) {
      throw new Error(`Profile not found for domain: ${job.domain}`);
    }
    
    const documents = job.documents as any[] || [];
    const fields = profile.schema.fields;
    
    // Build columns
    const columns = fields.map((field: any) => ({
      id: field.field,
      label: field.display_label,
      unit: profile.unit_targets[field.field] || field.unit || null,
      better: this.getFieldOptimality(field.field)
    }));
    
    // Build rows (one per document)
    const rows = documents.map((doc: any) => {
      const cells: Record<string, any> = {};
      
      for (const field of fields) {
        const extraction = extractions.find(e => 
          e.document_id === doc.id && e.field_id === field.field
        );
        
        if (extraction) {
          cells[field.field] = {
            value: extraction.value_normalized,
            unit: extraction.unit,
            confidence: extraction.confidence,
            provenance_ref: extraction.provenance_ref,
            flags: extraction.flags || []
          };
        } else {
          cells[field.field] = {
            value: null,
            unit: null,
            confidence: 0,
            provenance_ref: '',
            flags: ['missing']
          };
        }
      }
      
      return {
        document_id: doc.id,
        cells
      };
    });
    
    // Calculate highlights (best/worst values per column)
    const highlights = this.calculateHighlights(columns, rows);
    
    // Save results
    await supabase
      .from('results')
      .insert({
        job_id: jobId,
        columns,
        rows,
        highlights,
        exports: null
      });
    
    await this.updateJobStatus(jobId, 'READY');
    console.log('✅ Results building completed');
  }
  
  /**
   * Helper: Update job status
   */
  private async updateJobStatus(jobId: string, status: string) {
    await supabase
      .from('jobs')
      .update({ status })
      .eq('id', jobId);
  }
  
  /**
   * Helper: Calculate progress percentage
   */
  private calculateProgress(status: string): number {
    const statusMap: Record<string, number> = {
      'CREATED': 0,
      'UPLOADED': 10,
      'CLASSIFYING': 20,
      'CLASSIFIED': 30,
      'PARSING': 40,
      'PARSED': 50,
      'EXTRACTING': 60,
      'EXTRACTED': 70,
      'NORMALIZING': 80,
      'NORMALIZED': 90,
      'BUILDING': 95,
      'READY': 100,
      'FAILED': 0,
      'PARTIAL': 75,
      'CANCELLED': 0
    };
    
    return statusMap[status] || 0;
  }
  
  /**
   * Helper: Get field optimality direction
   */
  private getFieldOptimality(fieldId: string): "up" | "down" | undefined {
    const upFields = ['frequency_max', 'sla_uptime', 'rate_limit'];
    const downFields = ['power_consumption', 'latency_p95'];
    
    if (upFields.includes(fieldId)) return "up";
    if (downFields.includes(fieldId)) return "down";
    return undefined;
  }
  
  /**
   * Helper: Calculate highlights for comparison table
   */
  private calculateHighlights(columns: any[], rows: any[]): any[] {
    const highlights: any[] = [];
    
    for (const column of columns) {
      const values = rows
        .map(row => ({
          documentId: row.document_id,
          cell: row.cells[column.id],
        }))
        .filter(item => 
          item.cell && 
          item.cell.value !== null && 
          typeof item.cell.value === 'number' &&
          !item.cell.flags.includes('missing')
        );
      
      if (values.length < 2) continue;
      
      const numericValues = values.map(item => ({
        documentId: item.documentId,
        value: item.cell.value as number,
      }));
      
      let best, worst;
      
      if (column.better === "up") {
        best = numericValues.reduce((a, b) => a.value > b.value ? a : b);
        worst = numericValues.reduce((a, b) => a.value < b.value ? a : b);
      } else if (column.better === "down") {
        best = numericValues.reduce((a, b) => a.value < b.value ? a : b);
        worst = numericValues.reduce((a, b) => a.value > b.value ? a : b);
      } else {
        continue;
      }
      
      if (best && worst && best.documentId !== worst.documentId) {
        highlights.push({
          columnId: column.id,
          type: "best",
          documentId: best.documentId,
          value: best.value,
        });
        
        highlights.push({
          columnId: column.id,
          type: "worst", 
          documentId: worst.documentId,
          value: worst.value,
        });
      }
    }
    
    return highlights;
  }
  
  /**
   * Helper: Ensure default domain profiles exist
   */
  private async ensureDefaultProfiles() {
    console.log('🔍 Checking for default domain profiles...');
    
    // Check if profiles exist
    const { data: existingProfiles } = await supabase
      .from('profiles')
      .select('domain')
      .in('domain', ['semiconductors', 'api_sdk']);
    
    const existingDomains = new Set(existingProfiles?.map(p => p.domain) || []);
    
    // Insert semiconductors profile if missing
    if (!existingDomains.has('semiconductors')) {
      console.log('📝 Inserting semiconductors profile...');
      await supabase
        .from('profiles')
        .insert({
          domain: 'semiconductors',
          version: '1.0',
          schema: {
            fields: [
              { field: 'model', type: 'text', required: true, display_label: 'Model' },
              { field: 'power_consumption', type: 'numeric', required: true, display_label: 'Power Consumption', unit: 'mW' },
              { field: 'voltage_supply', type: 'numeric', required: true, display_label: 'Supply Voltage', unit: 'V' },
              { field: 'frequency_max', type: 'numeric', required: false, display_label: 'Max Frequency', unit: 'MHz' },
              { field: 'temperature_range', type: 'range', required: false, display_label: 'Temperature Range', unit: '°C' },
              { field: 'package_type', type: 'text', required: false, display_label: 'Package' },
            ]
          },
          synonyms: {
            model: ['part number', 'model number', 'device'],
            power_consumption: ['power', 'current consumption', 'supply current', 'icc'],
            voltage_supply: ['vdd', 'vcc', 'supply voltage', 'operating voltage'],
            frequency_max: ['max frequency', 'clock speed', 'operating frequency'],
            temperature_range: ['operating temperature', 'temp range', 'ambient temperature'],
            package_type: ['package', 'form factor', 'enclosure']
          },
          unit_targets: {
            power_consumption: 'mW',
            voltage_supply: 'V',
            frequency_max: 'MHz',
            temperature_range: '°C'
          },
          rules: {
            bounds: {
              power_consumption: { min: 0, max: 10000 },
              voltage_supply: { min: 0, max: 50 }
            }
          }
        });
    }
    
    // Insert API SDK profile if missing
    if (!existingDomains.has('api_sdk')) {
      console.log('📝 Inserting api_sdk profile...');
      await supabase
        .from('profiles')
        .insert({
          domain: 'api_sdk',
          version: '1.0',
          schema: {
            fields: [
              { field: 'name', type: 'text', required: true, display_label: 'API Name' },
              { field: 'version', type: 'text', required: true, display_label: 'Version' },
              { field: 'authentication', type: 'list', required: true, display_label: 'Authentication' },
              { field: 'rate_limit', type: 'numeric', required: false, display_label: 'Rate Limit', unit: 'req/s' },
              { field: 'latency_p95', type: 'numeric', required: false, display_label: 'Latency P95', unit: 'ms' },
              { field: 'sla_uptime', type: 'numeric', required: false, display_label: 'SLA Uptime', unit: '%' },
            ]
          },
          synonyms: {
            name: ['api name', 'service name', 'endpoint'],
            version: ['api version', 'v', 'release'],
            authentication: ['auth', 'security', 'api key', 'oauth', 'jwt'],
            rate_limit: ['rate limit', 'throttling', 'requests per second', 'rps'],
            latency_p95: ['latency', 'response time', 'p95', '95th percentile'],
            sla_uptime: ['uptime', 'availability', 'sla', 'service level']
          },
          unit_targets: {
            rate_limit: 'req/s',
            latency_p95: 'ms',
            sla_uptime: '%'
          },
          rules: {
            bounds: {
              rate_limit: { min: 0, max: 100000 },
              latency_p95: { min: 0, max: 10000 },
              sla_uptime: { min: 90, max: 100 }
            }
          }
        });
    }
    
    console.log('✅ Domain profiles are ready');
  }
  
  /**
   * Helper: Ensure default workspace exists
   */
  private async ensureDefaultWorkspace() {
    console.log('🔍 Checking for default workspace...');
    
    const { data: existingWorkspace } = await supabase
      .from('workspaces')
      .select('id')
      .eq('id', DEFAULT_WORKSPACE_ID)
      .single();
    
    if (!existingWorkspace) {
      console.log('📝 Creating default workspace...');
      await supabase
        .from('workspaces')
        .insert({
          id: DEFAULT_WORKSPACE_ID,
          name: 'Default Workspace',
          owner_id: 'default_user',
          plan: 'pro'
        });
      console.log('✅ Default workspace created');
    }
  }
}

// Export singleton instance
export const apiGateway = new APIGateway();