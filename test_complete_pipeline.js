// Test completo della pipeline con Google Cloud Vision OCR
import fs from 'fs';
import FormData from 'form-data';
import fetch from 'node-fetch';

const API_BASE = 'https://kindred-otter-506.convex.site';

async function testCompletePipeline() {
  console.log('🚀 TEST PIPELINE COMPLETA - Google Cloud Vision OCR + LangChain');
  console.log('='.repeat(80));
  
  try {
    // Step 1: Create job
    console.log('\n1️⃣ Creazione job...');
    const createJobRes = await fetch(`${API_BASE}/api/jobs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'http://localhost:5173',
      },
      body: JSON.stringify({
        workspaceId: 'default_workspace_123',
        domainMode: 'auto',
      }),
    });
    
    const createJobData = await createJobRes.json();
    console.log('✅ Job creato:', createJobData);
    
    const jobId = createJobData.jobId;
    
    // Step 2: Upload PDFs
    console.log('\n2️⃣ Upload dei datasheet chip...');
    await uploadPdf(jobId, '/Users/leonardocribari/Desktop/lm74910h-q1.pdf', 'LM74910-Q1_datasheet.pdf');
    await uploadPdf(jobId, '/Users/leonardocribari/Desktop/chip1 test.pdf', 'Chip1_test_datasheet.pdf');
    
    // Step 3: Start processing
    console.log('\n3️⃣ Avvio pipeline completa...');
    const processRes = await fetch(`${API_BASE}/api/process-job`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'http://localhost:5173',
      },
      body: JSON.stringify({ jobId }),
    });
    
    const processData = await processRes.json();
    console.log('✅ Pipeline avviata:', processData);
    
    // Step 4: Monitor pipeline
    console.log('\n4️⃣ Monitoraggio pipeline completa...');
    await monitorPipelineProgress(jobId);
    
  } catch (error) {
    console.error('❌ Errore:', error);
  }
}

async function uploadPdf(jobId, filePath, filename) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File non trovato: ${filePath}`);
  }
  
  console.log(`  📄 Upload ${filename}...`);
  
  // Get upload URL
  const uploadUrlRes = await fetch(`${API_BASE}/api/upload-url`, {
    headers: { 'Origin': 'http://localhost:5173' },
  });
  const uploadUrlData = await uploadUrlRes.json();
  
  // Upload file
  const form = new FormData();
  form.append('file', fs.createReadStream(filePath));
  
  const uploadRes = await fetch(uploadUrlData.url, {
    method: 'POST',
    body: form,
  });
  
  const uploadData = await uploadRes.json();
  console.log(`  ☁️ Storage: ${uploadData.storageId}`);
  
  // Add to job
  const addDocRes = await fetch(`${API_BASE}/api/upload-document`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Origin': 'http://localhost:5173',
    },
    body: JSON.stringify({
      jobId,
      filename,
      storageId: uploadData.storageId,
    }),
  });
  
  const addDocData = await addDocRes.json();
  console.log(`  ✅ Aggiunto al job: ${addDocData.documentId || 'OK'}`);
}

async function monitorPipelineProgress(jobId) {
  const stages = {
    'CREATED': { icon: '🆕', name: 'Job Inizializzato', desc: 'Job creato nel sistema' },
    'UPLOADED': { icon: '📤', name: 'PDF Caricati', desc: 'Documenti caricati in Convex storage' },
    'CLASSIFIED': { icon: '🏷️', name: 'Dominio Classificato', desc: 'Riconosciuto come semiconductors' },
    'PARSED': { icon: '📝', name: 'OCR Completato', desc: 'Google Vision API ha estratto testo e tabelle' },
    'EXTRACTED': { icon: '🔍', name: 'Dati Estratti', desc: 'LangChain ha identificato i campi tecnici' },
    'NORMALIZED': { icon: '📊', name: 'Dati Normalizzati', desc: 'Unità convertite e valori standardizzati' },
    'BUILT': { icon: '🔧', name: 'Tabella Costruita', desc: 'Tabella comparativa generata' },
    'READY': { icon: '✅', name: 'COMPLETATO', desc: 'Tabella comparativa pronta!' },
    'FAILED': { icon: '❌', name: 'ERRORE', desc: 'Pipeline fallita' },
    'PARTIAL': { icon: '⚠️', name: 'PARZIALE', desc: 'Completato con warnings' }
  };
  
  let previousStatus = null;
  let stageStartTime = Date.now();
  
  for (let i = 0; i < 120; i++) { // 20 minuti max
    try {
      const statusRes = await fetch(`${API_BASE}/api/job-status?jobId=${encodeURIComponent(jobId)}`, {
        headers: { 'Origin': 'http://localhost:5173' },
      });
      
      const statusData = await statusRes.json();
      const currentStatus = statusData.job.status;
      const stage = stages[currentStatus] || { icon: '🔄', name: currentStatus, desc: 'Status sconosciuto' };
      
      // Log stage transitions
      if (currentStatus !== previousStatus) {
        if (previousStatus) {
          const duration = ((Date.now() - stageStartTime) / 1000).toFixed(1);
          console.log(`    ⏱️ Completato in ${duration}s\n`);
        }
        
        console.log(`  ${stage.icon} ${stage.name}`);
        console.log(`    📝 ${stage.desc}`);
        
        // Show additional details
        if (currentStatus === 'CLASSIFIED' && statusData.job.domain) {
          console.log(`    🎯 Dominio: ${statusData.job.domain}`);
        }
        
        if (statusData.job.metrics) {
          const m = statusData.job.metrics;
          if (m.pagesTotal > 0) {
            console.log(`    📄 Pagine totali: ${m.pagesTotal}`);
            console.log(`    🔍 Pagine OCR: ${m.ocrPages}`);
            if (m.costEstimate > 0) {
              console.log(`    💰 Costo stimato: $${m.costEstimate.toFixed(4)}`);
            }
          }
        }
        
        if (statusData.documentsDetail) {
          console.log(`    📚 Documenti: ${statusData.documentsDetail.length}`);
          statusData.documentsDetail.forEach(doc => {
            console.log(`      - ${doc.filename}: ${doc.pages || 0} pagine`);
          });
        }
        
        if (statusData.job.error) {
          console.log(`    ⚠️ Errore: ${statusData.job.error}`);
        }
        
        previousStatus = currentStatus;
        stageStartTime = Date.now();
      }
      
      // Handle completion
      if (currentStatus === 'READY') {
        const totalDuration = ((Date.now() - stageStartTime) / 1000).toFixed(1);
        console.log(`    ⏱️ Pipeline completata in ${totalDuration}s\n`);
        
        console.log('🎉 PIPELINE COMPLETATA CON SUCCESSO!');
        console.log('='.repeat(50));
        
        await showComparisonTable(jobId, statusData);
        break;
        
      } else if (currentStatus === 'FAILED') {
        console.log('\n❌ PIPELINE FALLITA');
        console.log(`Errore: ${statusData.job.error}`);
        break;
        
      } else if (currentStatus === 'PARTIAL') {
        console.log('\n⚠️ PIPELINE COMPLETATA PARZIALMENTE');
        await showComparisonTable(jobId, statusData);
        break;
      }
      
      // Wait 10 seconds
      await new Promise(resolve => setTimeout(resolve, 10000));
      
    } catch (error) {
      console.log(`  ⚠️ Errore check: ${error.message}`);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
  
  if (!['READY', 'FAILED', 'PARTIAL'].includes(previousStatus)) {
    console.log('\n⏰ Timeout raggiunto');
    console.log(`Status finale: ${previousStatus}`);
  }
}

async function showComparisonTable(jobId, statusData) {
  try {
    console.log('\n📊 RECUPERO TABELLA COMPARATIVA...');
    
    const resultsRes = await fetch(`${API_BASE}/api/job-results?jobId=${encodeURIComponent(jobId)}`, {
      headers: { 'Origin': 'http://localhost:5173' },
    });
    
    const results = await resultsRes.json();
    
    if (results && results.columns && results.rows) {
      console.log('\n🏆 TABELLA COMPARATIVA CHIP GENERATA!');
      console.log('='.repeat(80));
      
      // Table structure info
      console.log(`📋 Struttura: ${results.columns.length} colonne, ${results.rows.length} righe\n`);
      
      // Display comparison table
      const headers = ['Campo', ...results.columns.map(col => col.label || col.id)];
      console.log(headers.join(' | '));
      console.log('-'.repeat(headers.join(' | ').length));
      
      results.rows.forEach(row => {
        const rowData = [
          row.fieldLabel || row.fieldId || 'N/A',
          ...results.columns.map(col => {
            const cell = row.cells && row.cells[col.id];
            if (cell) {
              const value = cell.value || 'N/A';
              const unit = cell.unit ? ` ${cell.unit}` : '';
              const confidence = cell.confidence ? ` (${(cell.confidence * 100).toFixed(0)}%)` : '';
              return `${value}${unit}${confidence}`;
            }
            return 'N/A';
          })
        ];
        console.log(rowData.join(' | '));
      });
      
      // Highlights
      if (results.highlights && results.highlights.length > 0) {
        console.log('\n🎯 HIGHLIGHTS:');
        results.highlights.forEach(highlight => {
          const field = results.rows.find(r => r.fieldId === highlight.fieldId);
          const column = results.columns.find(c => c.id === highlight.columnId);
          if (field && column) {
            console.log(`  ⭐ ${field.fieldLabel}: ${column.label} - ${highlight.reason}`);
          }
        });
      }
      
      // Final stats
      console.log('\n📈 STATISTICHE FINALI:');
      if (statusData.job.metrics?.latencyMs) {
        console.log(`  ⏱️ Tempo totale: ${(statusData.job.metrics.latencyMs / 1000).toFixed(1)}s`);
      }
      console.log(`  📄 Documenti: ${statusData.documents}`);
      console.log(`  🔍 Campi estratti: ${results.rows.length}`);
      
      const avgConfidence = results.rows.reduce((sum, row) => {
        const confidences = Object.values(row.cells || {})
          .map(cell => cell.confidence || 0)
          .filter(c => c > 0);
        return sum + (confidences.length > 0 ? confidences.reduce((a, b) => a + b, 0) / confidences.length : 0);
      }, 0) / (results.rows.length || 1);
      
      console.log(`  📊 Confidenza media: ${(avgConfidence * 100).toFixed(1)}%`);
      
    } else {
      console.log('⚠️ Tabella non ancora disponibile');
      console.log('Dati ricevuti:', JSON.stringify(results, null, 2));
    }
    
  } catch (error) {
    console.log(`❌ Errore recupero tabella: ${error.message}`);
  }
}

// Start the test
testCompletePipeline().catch(console.error);