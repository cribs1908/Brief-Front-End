import { httpRouter } from "convex/server";
import { paymentWebhook } from "./subscriptions";
import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const http = httpRouter();

// Helper function for CORS headers
function createCorsHeaders(methods: string = "GET, POST, OPTIONS") {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": methods,
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
    "Vary": "origin",
  };
}

// === NEW JOB MANAGEMENT API (PRD-compliant) ===

// Create a new job
http.route({
  path: "/api/jobs",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    try {
      const body = await req.json();
      const { workspaceId, domainMode, domain } = body;

      // Create default workspace if none provided (for legacy compatibility)
      let finalWorkspaceId = workspaceId;
      if (!finalWorkspaceId || finalWorkspaceId === "default_workspace_123") {
        // Create or find default workspace
        try {
          finalWorkspaceId = await ctx.runMutation(api.workspaces.createDefaultWorkspaceForUser, {
            userId: "default_user",
          });
        } catch (error) {
          // Workspace might already exist, try to find it
          const existing = await ctx.runQuery(api.workspaces.getUserWorkspaces, {
            userId: "default_user"
          });
          if (existing && existing.length > 0) {
            finalWorkspaceId = existing[0]._id;
          } else {
            throw new Error("Could not create or find default workspace");
          }
        }
      }

      const jobId = await ctx.runMutation(api.jobs.createJob, {
        workspaceId: finalWorkspaceId as Id<"workspaces">,
        domainMode: domainMode || "auto",
        domain,
      });

      return new Response(JSON.stringify({ 
        jobId: jobId,
        status: "CREATED",
      }), {
        status: 201,
        headers: createCorsHeaders(),
      });
    } catch (error: any) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: createCorsHeaders(),
      });
    }
  }),
});

// Upload document to job
http.route({
  path: "/api/upload-document",
  method: "POST", 
  handler: httpAction(async (ctx, req) => {
    try {
      const body = await req.json();
      const { jobId, filename, storageId } = body;

      if (!jobId || !filename || !storageId) {
        return new Response(JSON.stringify({ 
          error: "jobId, filename, and storageId are required" 
        }), {
          status: 400,
          headers: createCorsHeaders(),
        });
      }

      const documentId = await ctx.runAction(api.jobs.uploadDocument, {
        jobId: jobId as Id<"jobs">,
        filename,
        storageId: storageId as Id<"_storage">,
      });

      return new Response(JSON.stringify({ 
        documentId,
        status: "uploaded",
      }), {
        status: 201,
        headers: createCorsHeaders(),
      });
    } catch (error: any) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: createCorsHeaders(),
      });
    }
  }),
});

// Process job (start the pipeline)
http.route({
  path: "/api/process-job",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    try {
      const body = await req.json();
      const { jobId } = body;
      
      if (!jobId) {
        return new Response(JSON.stringify({ error: "jobId is required" }), {
          status: 400,
          headers: createCorsHeaders(),
        });
      }

      // Start processing in background
      void ctx.runAction(api.jobs.processJob, {
        jobId: jobId as Id<"jobs">,
      });

      return new Response(JSON.stringify({ 
        message: "Job processing started",
        jobId: jobId,
      }), {
        status: 200,
        headers: createCorsHeaders(),
      });
    } catch (error: any) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: createCorsHeaders(),
      });
    }
  }),
});

// Get job status and details
http.route({
  path: "/api/job-status",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    try {
      const url = new URL(req.url);
      const jobId = url.searchParams.get("jobId");
      
      if (!jobId) {
        return new Response(JSON.stringify({ error: "jobId is required" }), {
          status: 400,
          headers: createCorsHeaders(),
        });
      }

      const jobDetails = await ctx.runQuery(api.jobs.getJobWithDocuments, {
        jobId: jobId as Id<"jobs">,
      });

      if (!jobDetails) {
        return new Response(JSON.stringify({ error: "Job not found" }), {
          status: 404,
          headers: createCorsHeaders(),
        });
      }

      return new Response(JSON.stringify(jobDetails), {
        status: 200,
        headers: createCorsHeaders(),
      });
    } catch (error: any) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: createCorsHeaders(),
      });
    }
  }),
});

// Get job results (comparison table)
http.route({
  path: "/api/job-results",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    try {
      const url = new URL(req.url);
      const jobId = url.searchParams.get("jobId");
      
      if (!jobId) {
        return new Response(JSON.stringify({ error: "jobId is required" }), {
          status: 400,
          headers: createCorsHeaders(),
        });
      }

      const results = await ctx.runQuery(api.jobs.getJobResults, {
        jobId: jobId as Id<"jobs">,
      });

      return new Response(JSON.stringify(results), {
        status: 200,
        headers: createCorsHeaders(),
      });
    } catch (error: any) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: createCorsHeaders(),
      });
    }
  }),
});

// Export job results
http.route({
  path: "/api/jobs/:jobId/export",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    try {
      const jobIdParam = req.url.split('/')[3]; // Extract from path
      const body = await req.json();
      const { format } = body;

      if (!jobIdParam || !format) {
        return new Response(JSON.stringify({ 
          error: "jobId and format are required" 
        }), {
          status: 400,
          headers: createCorsHeaders(),
        });
      }

      const exportUrl = await ctx.runAction(api.jobs.exportJobResults, {
        jobId: jobIdParam as Id<"jobs">,
        format,
      });

      return new Response(JSON.stringify({ 
        exportUrl,
        format,
      }), {
        status: 200,
        headers: createCorsHeaders(),
      });
    } catch (error: any) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: createCorsHeaders(),
      });
    }
  }),
});

// Get workspace jobs
http.route({
  path: "/api/workspaces/:workspaceId/jobs",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    try {
      const workspaceIdParam = req.url.split('/')[4]; // Extract from path
      const url = new URL(req.url);
      const limit = url.searchParams.get("limit");

      if (!workspaceIdParam) {
        return new Response(JSON.stringify({ error: "workspaceId is required" }), {
          status: 400,
          headers: createCorsHeaders(),
        });
      }

      const jobs = await ctx.runQuery(api.jobs.getWorkspaceJobs, {
        workspaceId: workspaceIdParam as Id<"workspaces">,
        limit: limit ? parseInt(limit) : undefined,
      });

      return new Response(JSON.stringify(jobs), {
        status: 200,
        headers: createCorsHeaders(),
      });
    } catch (error: any) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: createCorsHeaders(),
      });
    }
  }),
});

// === WORKSPACE API ===

// Create workspace
http.route({
  path: "/api/workspaces",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    try {
      const body = await req.json();
      const { name, ownerId, plan } = body;

      if (!name || !ownerId) {
        return new Response(JSON.stringify({ 
          error: "name and ownerId are required" 
        }), {
          status: 400,
          headers: createCorsHeaders(),
        });
      }

      const workspaceId = await ctx.runMutation(api.workspaces.createWorkspace, {
        name,
        ownerId,
        plan: plan || "free",
      });

      return new Response(JSON.stringify({ 
        workspaceId,
        name,
        plan: plan || "free",
      }), {
        status: 201,
        headers: createCorsHeaders(),
      });
    } catch (error: any) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: createCorsHeaders(),
      });
    }
  }),
});

// Get user workspaces
http.route({
  path: "/api/users/:userId/workspaces",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    try {
      const userIdParam = req.url.split('/')[4]; // Extract from path

      if (!userIdParam) {
        return new Response(JSON.stringify({ error: "userId is required" }), {
          status: 400,
          headers: createCorsHeaders(),
        });
      }

      const workspaces = await ctx.runQuery(api.workspaces.getUserWorkspaces, {
        userId: userIdParam,
      });

      return new Response(JSON.stringify(workspaces), {
        status: 200,
        headers: createCorsHeaders(),
      });
    } catch (error: any) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: createCorsHeaders(),
      });
    }
  }),
});

// === UTILITY ENDPOINTS ===

// Storage upload URL for client-side PDF uploads
http.route({
  path: "/api/upload-url",
  method: "GET",
  handler: httpAction(async (ctx, _req) => {
    const url = await ctx.storage.generateUploadUrl();
    return new Response(JSON.stringify({ url }), {
      status: 200,
      headers: createCorsHeaders(),
    });
  }),
});

// Health check
http.route({
  path: "/health",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    return new Response(JSON.stringify({ 
      status: "healthy",
      timestamp: new Date().toISOString(),
      version: "2.0.0-prd",
    }), { 
      status: 200,
      headers: createCorsHeaders(),
    });
  }),
});

// Server-Sent Events endpoint for job status updates
http.route({
  path: "/api/jobs/:jobId/events",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    const jobIdParam = req.url.split('/')[4]; // Extract from path
    
    if (!jobIdParam) {
      return new Response("Job ID required", { status: 400 });
    }

    const headers = {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Cache-Control",
    };

    // Create SSE stream
    const stream = new ReadableStream({
      start(controller) {
        // Send initial connection event
        controller.enqueue(`data: ${JSON.stringify({ type: 'connected', jobId: jobIdParam })}\n\n`);
        
        // Set up polling for job status
        const pollJob = async () => {
          try {
            const jobDetails = await ctx.runQuery(api.jobs.getJobWithDocuments, {
              jobId: jobIdParam as Id<"jobs">,
            });
            
            if (jobDetails) {
              const event = {
                type: 'job_status',
                jobId: jobIdParam,
                status: jobDetails.job.status,
                error: jobDetails.job.error,
                metrics: jobDetails.job.metrics,
                documents: jobDetails.documents,
                timestamp: new Date().toISOString()
              };
              
              controller.enqueue(`data: ${JSON.stringify(event)}\n\n`);
              
              // Close stream if job is in terminal state
              if (['READY', 'FAILED', 'CANCELLED'].includes(jobDetails.job.status)) {
                controller.close();
                return;
              }
            }
          } catch (error) {
            const errorEvent = {
              type: 'error',
              jobId: jobIdParam,
              message: error instanceof Error ? error.message : 'Unknown error',
              timestamp: new Date().toISOString()
            };
            controller.enqueue(`data: ${JSON.stringify(errorEvent)}\n\n`);
          }
        };
        
        // Poll every 2 seconds
        const interval = setInterval(pollJob, 2000);
        
        // Cleanup after 5 minutes max
        setTimeout(() => {
          clearInterval(interval);
          controller.close();
        }, 5 * 60 * 1000);
      }
    });

    return new Response(stream, { headers });
  }),
});

// === OPTIONS HANDLERS (CORS) ===

const optionsHandler = httpAction(async (_, request) => {
  const headers = request.headers;
  if (
    headers.get("Origin") !== null &&
    headers.get("Access-Control-Request-Method") !== null
  ) {
    return new Response(null, {
      headers: new Headers(createCorsHeaders("GET, POST, PUT, DELETE, OPTIONS")),
    });
  }
  return new Response();
});

// === LEGACY API COMPATIBILITY ===

http.route({
  path: "/api/jobs/create",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    // Legacy endpoint - redirect to new pipeline for backward compatibility
    const body = await req.json();
    try {
      const result = await ctx.runAction(api.pipeline.createComparisonJob, body);
      void ctx.runAction(api.pipeline.processAllDocumentsForJob as any, { 
        jobId: result.job_id as any 
      });
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: createCorsHeaders(),
      });
    } catch (error: any) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: createCorsHeaders(),
      });
    }
  }),
});

// Legacy status endpoint
http.route({
  path: "/api/jobs/status",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    const url = new URL(req.url);
    const jobId = url.searchParams.get("jobId");
    if (!jobId) {
      return new Response(JSON.stringify({ error: "Missing jobId" }), { 
        status: 400,
        headers: createCorsHeaders(),
      });
    }

    try {
      const status = await ctx.runQuery(api.pipeline.getJobStatus, { 
        jobId: jobId as unknown as Id<"comparisonJobs"> 
      });
      return new Response(JSON.stringify(status), {
        status: 200,
        headers: createCorsHeaders(),
      });
    } catch (error: any) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: createCorsHeaders(),
      });
    }
  }),
});

// Legacy dataset endpoint  
http.route({
  path: "/api/jobs/dataset",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    const url = new URL(req.url);
    const jobId = url.searchParams.get("jobId");
    if (!jobId) {
      return new Response(JSON.stringify({ error: "Missing jobId" }), { 
        status: 400,
        headers: createCorsHeaders(),
      });
    }

    try {
      const data = await ctx.runQuery(api.pipeline.getComparisonDataset, { 
        jobId: jobId as unknown as Id<"comparisonJobs"> 
      });
      return new Response(JSON.stringify(data), {
        status: 200,
        headers: createCorsHeaders(),
      });
    } catch (error: any) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: createCorsHeaders(),
      });
    }
  }),
});

// Debug endpoint
http.route({
  path: "/debug/jobs",
  method: "GET", 
  handler: httpAction(async (ctx, req) => {
    try {
      const jobs = await ctx.runQuery(api.pipeline.getLatestJobs);
      return new Response(JSON.stringify(jobs, null, 2), {
        status: 200,
        headers: createCorsHeaders(),
      });
    } catch (error: any) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: createCorsHeaders(),
      });
    }
  }),
});

// === BILLING WEBHOOK ===
http.route({
  path: "/payments/webhook",
  method: "POST",
  handler: paymentWebhook,
});

// === CORS OPTIONS HANDLERS (MUST BE LAST) ===

// Universal OPTIONS handler for all API routes
http.route({
  path: "/api/*",
  method: "OPTIONS",
  handler: optionsHandler,
});

// Catch-all OPTIONS handler
http.route({
  path: "/*",
  method: "OPTIONS",
  handler: optionsHandler,
});

export default http;