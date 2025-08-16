// Final test script for the two specified chip PDFs
import fs from 'fs';
import FormData from 'form-data';
import fetch from 'node-fetch';

const API_BASE = 'https://kindred-otter-506.convex.site';

async function testFinalChipUpload() {
  console.log('🚀 Testing SpecSheet Comparator with the two specified chip PDFs...\n');
  
  try {
    // Step 1: Create a new comparison job
    console.log('1️⃣ Creating new comparison job...');
    const createJobRes = await fetch(`${API_BASE}/api/jobs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'http://localhost:5173',
      },
      body: JSON.stringify({
        workspaceId: 'default_workspace_123',
        domainMode: 'auto', // Let the system auto-detect semiconductors domain
      }),
    });
    
    const createJobData = await createJobRes.json();
    console.log('✅ Job created:', createJobData);
    
    if (!createJobData.jobId) {
      throw new Error('No job ID returned');
    }
    
    const jobId = createJobData.jobId;
    
    // Step 2: Upload chip1 test.pdf
    console.log('\n2️⃣ Uploading chip1 test.pdf...');
    await uploadPdf(jobId, '/Users/leonardocribari/Desktop/chip1 test.pdf', 'chip1_test.pdf');
    
    // Step 3: Upload lm74910h-q1.pdf  
    console.log('\n3️⃣ Uploading lm74910h-q1.pdf...');
    await uploadPdf(jobId, '/Users/leonardocribari/Desktop/lm74910h-q1.pdf', 'lm74910h-q1.pdf');
    
    // Step 4: Start processing
    console.log('\n4️⃣ Starting SpecSheet processing pipeline...');
    const processRes = await fetch(`${API_BASE}/api/process-job`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'http://localhost:5173',
      },
      body: JSON.stringify({ jobId }),
    });
    
    const processData = await processRes.json();
    console.log('✅ Processing started:', processData);
    
    // Step 5: Monitor processing with detailed status updates
    console.log('\n5️⃣ Monitoring processing pipeline...');
    await monitorProcessingPipeline(jobId);
    
  } catch (error) {
    console.error('❌ Error in final test:', error);
  }
}

async function uploadPdf(jobId, filePath, filename) {
  // Check if file exists
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  
  console.log(`  📄 Processing ${filename}...`);
  
  // Get upload URL from Convex
  const uploadUrlRes = await fetch(`${API_BASE}/api/upload-url`, {
    headers: {
      'Origin': 'http://localhost:5173',
    },
  });
  const uploadUrlData = await uploadUrlRes.json();
  
  console.log(`  🔗 Got upload URL`);
  
  // Upload file to Convex storage
  const form = new FormData();
  form.append('file', fs.createReadStream(filePath));
  
  const uploadRes = await fetch(uploadUrlData.url, {
    method: 'POST',
    body: form,
  });
  
  const uploadData = await uploadRes.json();
  console.log(`  ☁️ File uploaded, storage ID: ${uploadData.storageId}`);
  
  // Add document to job
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
  console.log(`  ✅ Document added to job: ${addDocData.documentId || addDocData.status}`);
  
  return addDocData.documentId;
}

async function monitorProcessingPipeline(jobId) {
  const statusMap = {
    'CREATED': '🆕 Created',
    'UPLOADED': '📤 Uploaded', 
    'CLASSIFIED': '🏷️ Domain Classified',
    'PARSED': '📝 PDF Parsed',
    'EXTRACTED': '🔍 Data Extracted',
    'NORMALIZED': '📊 Data Normalized',
    'BUILT': '🔧 Results Built',
    'READY': '✅ Ready',
    'FAILED': '❌ Failed',
    'PARTIAL': '⚠️ Partial'
  };
  
  let previousStatus = null;
  
  for (let i = 0; i < 60; i++) { // Monitor for up to 10 minutes
    try {
      const statusRes = await fetch(`${API_BASE}/api/job-status?jobId=${encodeURIComponent(jobId)}`, {
        headers: {
          'Origin': 'http://localhost:5173',
        },
      });
      
      const statusData = await statusRes.json();
      const currentStatus = statusData.job.status;
      const statusIcon = statusMap[currentStatus] || `🔄 ${currentStatus}`;
      
      // Only log when status changes
      if (currentStatus !== previousStatus) {
        console.log(`  ${statusIcon} (${i + 1}/${60})`);
        
        if (statusData.job.error) {
          console.log(`  ⚠️ Error: ${statusData.job.error}`);
        }
        
        if (statusData.job.metrics) {
          const metrics = statusData.job.metrics;
          if (metrics.pagesTotal > 0) {
            console.log(`  📄 Pages: ${metrics.pagesTotal}, OCR: ${metrics.ocrPages}`);
          }
        }
        
        previousStatus = currentStatus;
      }
      
      if (currentStatus === 'READY') {
        console.log('\n🎉 SpecSheet processing completed successfully!');
        
        // Get final results
        const resultsRes = await fetch(`${API_BASE}/api/job-results?jobId=${encodeURIComponent(jobId)}`, {
          headers: {
            'Origin': 'http://localhost:5173',
          },
        });
        
        const resultsData = await resultsRes.json();
        console.log('\n📊 Comparison Results:');
        console.log(JSON.stringify(resultsData, null, 2));
        
        // Summary
        console.log('\n📋 Processing Summary:');
        console.log(`  Job ID: ${jobId}`);
        console.log(`  Documents: ${statusData.documents} PDFs processed`);
        console.log(`  Status: ${statusIcon}`);
        if (statusData.job.metrics?.latencyMs) {
          console.log(`  Processing Time: ${(statusData.job.metrics.latencyMs / 1000).toFixed(1)}s`);
        }
        
        break;
        
      } else if (currentStatus === 'FAILED') {
        console.log('\n❌ SpecSheet processing failed!');
        console.log('Error details:', statusData.job.error);
        break;
        
      } else if (currentStatus === 'PARTIAL') {
        console.log('\n⚠️ SpecSheet processing completed with some issues');
        // Still get results for partial completion
        try {
          const resultsRes = await fetch(`${API_BASE}/api/job-results?jobId=${encodeURIComponent(jobId)}`, {
            headers: {
              'Origin': 'http://localhost:5173',
            },
          });
          const resultsData = await resultsRes.json();
          console.log('Partial results:', JSON.stringify(resultsData, null, 2));
        } catch (e) {
          console.log('Could not fetch partial results');
        }
        break;
      }
      
      // Wait 10 seconds before next check
      await new Promise(resolve => setTimeout(resolve, 10000));
      
    } catch (error) {
      console.log(`  ⚠️ Status check error: ${error.message}`);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
  
  if (previousStatus !== 'READY' && previousStatus !== 'FAILED') {
    console.log('\n⏰ Monitoring timeout reached. Check status manually.');
    console.log(`Final status: ${statusMap[previousStatus] || previousStatus}`);
  }
}

// Run the test
console.log('🔬 SpecSheet Comparator Test - Chip PDF Analysis');
console.log('='.repeat(50));
testFinalChipUpload().catch(console.error);