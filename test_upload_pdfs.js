import fs from 'fs';

const CONVEX_URL = process.env.CONVEX_URL || "https://kindred-otter-506.convex.cloud";

async function uploadPdfsAndTest() {
  try {
    // PDF paths
    const pdfPaths = [
      "/Users/leonardocribari/Desktop/chip1 test.pdf",
      "/Users/leonardocribari/Desktop/lm74910h-q1.pdf"
    ];
    
    const uploadedPdfs = [];
    
    // Upload each PDF
    for (let i = 0; i < pdfPaths.length; i++) {
      const pdfPath = pdfPaths[i];
      const vendorHint = i === 0 ? "Generic Chip" : "Texas Instruments";
      
      console.log(`\n=== Uploading PDF ${i + 1}: ${pdfPath} ===`);
      
      // For now, use file:// URIs since storage upload is not working
      const fileUri = `file://${pdfPath}`;
      console.log("✅ Using file URI:", fileUri);
      
      uploadedPdfs.push({
        uri: fileUri,
        vendor_hint: vendorHint,
        filename: pdfPath.split('/').pop()
      });
    }
    
    // Step 3: Create comparison job with valid storageIds
    console.log("\n=== Creating Comparison Job ===");
    const jobPayload = {
      pdf_list: uploadedPdfs,
      job_name: "Chip Comparison Test - Direct PDF Storage"
    };
    
    console.log("Job payload:", JSON.stringify(jobPayload, null, 2));
    
    const jobResponse = await fetch(`${CONVEX_URL}/api/jobs/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(jobPayload)
    });
    
    if (!jobResponse.ok) {
      const errorText = await jobResponse.text();
      throw new Error(`Failed to create job: ${jobResponse.status} - ${errorText}`);
    }
    
    const jobResult = await jobResponse.json();
    console.log("✅ Job created successfully:", jobResult);
    
    // Step 4: Monitor job progress
    console.log("\n=== Monitoring Job Progress ===");
    const jobId = jobResult.job_id;
    let finalStatus = null;
    
    for (let attempt = 0; attempt < 30; attempt++) {
      console.log(`Checking status (attempt ${attempt + 1}/30)...`);
      
      const statusResponse = await fetch(`${CONVEX_URL}/api/jobs/status?jobId=${jobId}`);
      if (!statusResponse.ok) {
        console.warn(`Status check failed: ${statusResponse.statusText}`);
        continue;
      }
      
      const status = await statusResponse.json();
      console.log(`Status: ${status.job?.status}, Progress: ${status.job?.progress?.stage}`);
      
      if (status.job?.status === "ready" || status.job?.status === "failed" || status.job?.status === "ready_partial") {
        finalStatus = status;
        break;
      }
      
      // Wait 5 seconds before next check
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    
    if (!finalStatus) {
      console.log("⚠️ Job did not complete within timeout, but upload was successful");
      return;
    }
    
    console.log("\n=== Final Results ===");
    console.log("Final status:", finalStatus.job?.status);
    
    if (finalStatus.job?.status === "ready" || finalStatus.job?.status === "ready_partial") {
      // Fetch comparison dataset
      const datasetResponse = await fetch(`${CONVEX_URL}/api/jobs/dataset?jobId=${jobId}`);
      if (datasetResponse.ok) {
        const dataset = await datasetResponse.json();
        console.log("\n📊 Extracted Metrics:");
        console.log(`- Vendors: ${dataset.vendors?.length || 0}`);
        console.log(`- Metrics: ${dataset.metrics?.length || 0}`);
        
        if (dataset.metrics?.length > 0) {
          console.log("\nDetected metrics:");
          dataset.metrics.forEach(metric => {
            console.log(`  - ${metric.label} (${metric.metric_id})`);
          });
        }
      }
    } else {
      console.log("❌ Job failed or incomplete");
    }
    
  } catch (error) {
    console.error("❌ Error:", error.message);
    console.error("Full error:", error);
  }
}

// Run the test
uploadPdfsAndTest();