// Test per verificare la generazione della tabella comparativa dai chip PDF
import fs from 'fs';
import FormData from 'form-data';
import fetch from 'node-fetch';

const API_BASE = 'https://kindred-otter-506.convex.site';

async function testComparisonTable() {
  console.log('🔬 Test Tabella Comparativa - Chip Datasheet Analysis');
  console.log('='.repeat(60));
  
  try {
    // Step 1: Create new job
    console.log('\n1️⃣ Creazione nuovo job di confronto...');
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
    
    if (!createJobData.jobId) {
      throw new Error('No job ID returned');
    }
    
    const jobId = createJobData.jobId;
    
    // Step 2: Upload both chip PDFs
    console.log('\n2️⃣ Upload dei datasheet...');
    const doc1 = await uploadPdf(jobId, '/Users/leonardocribari/Desktop/lm74910h-q1.pdf', 'LM74910-Q1_datasheet.pdf');
    const doc2 = await uploadPdf(jobId, '/Users/leonardocribari/Desktop/chip1 test.pdf', 'Chip1_test_datasheet.pdf');
    
    // Step 3: Start processing
    console.log('\n3️⃣ Avvio pipeline di estrazione...');
    const processRes = await fetch(`${API_BASE}/api/process-job`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'http://localhost:5173',
      },
      body: JSON.stringify({ jobId }),
    });
    
    const processData = await processRes.json();
    console.log('✅ Processing avviato:', processData);
    
    // Step 4: Monitor with detailed pipeline tracking
    console.log('\n4️⃣ Monitoraggio pipeline di estrazione...');
    await monitorExtractionPipeline(jobId);
    
  } catch (error) {
    console.error('❌ Errore nel test:', error);
  }
}

async function uploadPdf(jobId, filePath, filename) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File non trovato: ${filePath}`);
  }
  
  console.log(`  📄 Caricamento ${filename}...`);
  
  // Get upload URL
  const uploadUrlRes = await fetch(`${API_BASE}/api/upload-url`, {
    headers: { 'Origin': 'http://localhost:5173' },
  });
  const uploadUrlData = await uploadUrlRes.json();
  
  // Upload to Convex storage
  const form = new FormData();
  form.append('file', fs.createReadStream(filePath));
  
  const uploadRes = await fetch(uploadUrlData.url, {
    method: 'POST',
    body: form,
  });
  
  const uploadData = await uploadRes.json();
  console.log(`  ☁️ Storage ID: ${uploadData.storageId}`);
  
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
  console.log(`  ✅ Documento aggiunto: ${addDocData.documentId || 'OK'}`);
  
  return addDocData.documentId;
}

async function monitorExtractionPipeline(jobId) {
  const pipelineSteps = {
    'CREATED': { icon: '🆕', name: 'Job Creato' },
    'UPLOADED': { icon: '📤', name: 'PDF Caricati' },
    'CLASSIFIED': { icon: '🏷️', name: 'Dominio Classificato (Semiconductors)' },
    'PARSED': { icon: '📝', name: 'PDF Parseati (OCR + Tabule)' },
    'EXTRACTED': { icon: '🔍', name: 'Dati Estratti (LangChain)' },
    'NORMALIZED': { icon: '📊', name: 'Unità Normalizzate' },
    'BUILT': { icon: '🔧', name: 'Tabella Costruita' },
    'READY': { icon: '✅', name: 'Tabella Comparativa Pronta' },
    'FAILED': { icon: '❌', name: 'Errore' },
    'PARTIAL': { icon: '⚠️', name: 'Completamento Parziale' }
  };
  
  let previousStatus = null;
  let stepStartTime = Date.now();
  
  for (let i = 0; i < 90; i++) { // 15 minutes max
    try {
      const statusRes = await fetch(`${API_BASE}/api/job-status?jobId=${encodeURIComponent(jobId)}`, {
        headers: { 'Origin': 'http://localhost:5173' },
      });
      
      const statusData = await statusRes.json();
      const currentStatus = statusData.job.status;
      const step = pipelineSteps[currentStatus] || { icon: '🔄', name: currentStatus };
      
      // Log when status changes
      if (currentStatus !== previousStatus) {
        if (previousStatus) {
          const stepDuration = ((Date.now() - stepStartTime) / 1000).toFixed(1);
          console.log(`    ⏱️ Step completato in ${stepDuration}s`);
        }
        
        console.log(`\n  ${step.icon} ${step.name}`);
        
        // Show additional details for specific steps
        if (currentStatus === 'CLASSIFIED' && statusData.job.domain) {
          console.log(`    🎯 Dominio rilevato: ${statusData.job.domain}`);
        }
        
        if (statusData.job.metrics) {
          const m = statusData.job.metrics;
          if (m.pagesTotal > 0) {
            console.log(`    📄 Pagine: ${m.pagesTotal}, OCR: ${m.ocrPages}, Costo: $${(m.costEstimate || 0).toFixed(3)}`);
          }
        }
        
        if (statusData.job.error) {
          console.log(`    ⚠️ Errore: ${statusData.job.error}`);
        }
        
        previousStatus = currentStatus;
        stepStartTime = Date.now();
      }
      
      // Handle terminal states
      if (currentStatus === 'READY') {
        const totalTime = ((Date.now() - stepStartTime) / 1000).toFixed(1);
        console.log(`    ⏱️ Pipeline completata in ${totalTime}s`);
        
        console.log('\n🎉 PIPELINE COMPLETATA! Generazione tabella comparativa...\n');
        
        // Get the comparison table
        await getComparisonTable(jobId, statusData);
        break;
        
      } else if (currentStatus === 'FAILED') {
        console.log('\n❌ Pipeline fallita!');
        console.log(`Errore: ${statusData.job.error}`);
        break;
        
      } else if (currentStatus === 'PARTIAL') {
        console.log('\n⚠️ Pipeline completata parzialmente');
        await getComparisonTable(jobId, statusData);
        break;
      }
      
      // Wait 10 seconds between checks
      await new Promise(resolve => setTimeout(resolve, 10000));
      
    } catch (error) {
      console.log(`  ⚠️ Errore check status: ${error.message}`);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
  
  if (!['READY', 'FAILED', 'PARTIAL'].includes(previousStatus)) {
    console.log('\n⏰ Timeout monitoraggio raggiunto');
    console.log(`Status finale: ${previousStatus}`);
  }
}

async function getComparisonTable(jobId, statusData) {
  try {
    console.log('📊 Recupero tabella comparativa...');
    
    const resultsRes = await fetch(`${API_BASE}/api/job-results?jobId=${encodeURIComponent(jobId)}`, {
      headers: { 'Origin': 'http://localhost:5173' },
    });
    
    const resultsData = await resultsRes.json();
    
    if (resultsData && resultsData.columns && resultsData.rows) {
      console.log('\n🏆 TABELLA COMPARATIVA GENERATA!');
      console.log('='.repeat(80));
      
      // Display table structure
      console.log('\n📋 Struttura della tabella:');
      console.log(`  Colonne: ${resultsData.columns.length}`);
      console.log(`  Righe: ${resultsData.rows.length}`);
      
      // Display the actual comparison table
      console.log('\n📊 TABELLA COMPARATIVA CHIP:');
      console.log('='.repeat(80));
      
      // Header
      const headers = ['Campo', ...resultsData.columns.map(col => col.label || col.id)];
      console.log(headers.join(' | '));
      console.log('-'.repeat(headers.join(' | ').length));
      
      // Rows
      if (resultsData.rows && resultsData.rows.length > 0) {
        resultsData.rows.forEach(row => {
          const rowData = [
            row.fieldLabel || row.fieldId || 'N/A',
            ...resultsData.columns.map(col => {
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
      }
      
      console.log('\n📈 Statistiche estrazione:');
      const docs = statusData.documentsDetail || [];
      docs.forEach((doc, i) => {
        console.log(`  📄 ${doc.filename}: ${doc.pages || 0} pagine`);
      });
      
      if (statusData.job.metrics?.latencyMs) {
        console.log(`  ⏱️ Tempo totale: ${(statusData.job.metrics.latencyMs / 1000).toFixed(1)}s`);
      }
      
    } else {
      console.log('⚠️ Risultati non ancora disponibili o formato non valido');
      console.log('Dati ricevuti:', JSON.stringify(resultsData, null, 2));
    }
    
  } catch (error) {
    console.log(`❌ Errore recupero risultati: ${error.message}`);
  }
}

// Run the test
testComparisonTable().catch(console.error);