// Test script for uploading the two chip PDFs
import fs from 'fs';
import FormData from 'form-data';
import fetch from 'node-fetch';

const API_BASE = 'https://kindred-otter-506.convex.site';

async function testChipUpload() {
  console.log('Testing chip PDF upload workflow...');
  
  try {
    // Step 1: Create a new comparison job using the new API
    console.log('\n1. Creating comparison job...');
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
    console.log('Job created:', createJobData);
    
    if (!createJobData.jobId) {
      throw new Error('No job ID returned');
    }
    
    const jobId = createJobData.jobId;
    
    // Step 2: Upload first PDF
    console.log('\n2. Uploading first PDF (chip1 test.pdf)...');
    await uploadPdf(jobId, '/Users/leonardocribari/Desktop/chip1 test.pdf', 'chip1_test.pdf');
    
    // Step 3: Upload second PDF  
    console.log('\n3. Uploading second PDF (lm74910h-q1.pdf)...');
    await uploadPdf(jobId, '/Users/leonardocribari/Desktop/lm74910h-q1.pdf', 'lm74910h-q1.pdf');
    
    // Step 4: Start processing
    console.log('\n4. Starting job processing...');
    const processRes = await fetch(`${API_BASE}/api/process-job`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'http://localhost:5173',
      },
      body: JSON.stringify({ jobId }),
    });
    
    const processData = await processRes.json();
    console.log('Processing started:', processData);
    
    // Step 5: Monitor job status
    console.log('\n5. Monitoring job status...');
    await monitorJobStatus(jobId);
    
  } catch (error) {
    console.error('Error in chip upload test:', error);
  }
}

async function uploadPdf(jobId, filePath, filename) {
  // Get upload URL
  const uploadUrlRes = await fetch(`${API_BASE}/api/upload-url`, {
    headers: {
      'Origin': 'http://localhost:5173',
    },
  });
  const uploadUrlData = await uploadUrlRes.json();
  
  console.log(`  Getting upload URL for ${filename}...`);
  
  // Upload file to Convex storage
  const form = new FormData();
  form.append('file', fs.createReadStream(filePath));
  
  const uploadRes = await fetch(uploadUrlData.url, {
    method: 'POST',
    body: form,
  });
  
  const uploadData = await uploadRes.json();
  console.log(`  File uploaded, storage ID: ${uploadData.storageId}`);
  
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
  console.log(`  Document added to job: ${addDocData.documentId}`);
  
  return addDocData.documentId;
}

async function monitorJobStatus(jobId) {
  for (let i = 0; i < 30; i++) { // Monitor for up to 5 minutes
    const statusRes = await fetch(`${API_BASE}/api/job-status?jobId=${encodeURIComponent(jobId)}`, {
      headers: {
        'Origin': 'http://localhost:5173',
      },
    });
    
    const statusData = await statusRes.json();
    console.log(`  Status check ${i + 1}: ${statusData.job.status}`);
    
    if (statusData.job.status === 'READY') {
      console.log('\n✅ Job completed successfully!');
      
      // Get results
      const resultsRes = await fetch(`${API_BASE}/api/job-results?jobId=${encodeURIComponent(jobId)}`, {
        headers: {
          'Origin': 'http://localhost:5173',
        },
      });
      
      const resultsData = await resultsRes.json();
      console.log('Results:', JSON.stringify(resultsData, null, 2));
      break;
    } else if (statusData.job.status === 'FAILED') {
      console.log('\n❌ Job failed!');
      console.log('Error:', statusData.job.error);
      break;
    }
    
    // Wait 10 seconds before next check
    await new Promise(resolve => setTimeout(resolve, 10000));
  }
}

// Run the test
testChipUpload().catch(console.error);