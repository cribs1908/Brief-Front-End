import { httpRouter } from "convex/server";
import { paymentWebhook } from "./subscriptions";
import { httpAction } from "./_generated/server";
import { openai } from "@ai-sdk/openai";
import { streamText } from "ai";
import { googleOAuthCallback } from "./integrations";
import { api } from "./_generated/api";

export const chat = httpAction(async (ctx, req) => {
  // Extract the `messages` from the body of the request
  const { messages } = await req.json();

  const result = streamText({
    model: openai("gpt-4o"),
    messages,
    async onFinish({ text }) {
      // implement your own logic here, e.g. for storing messages
      // or recording token usage
      console.log(text);
    },
  });

  // Respond with the stream
  return result.toDataStreamResponse({
    headers: {
      "Access-Control-Allow-Origin": process.env.FRONTEND_URL || "http://localhost:5173",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Credentials": "true",
      Vary: "origin",
    },
  });
});

const http = httpRouter();

http.route({
  path: "/api/chat",
  method: "POST",
  handler: chat,
});

http.route({
  path: "/api/chat",
  method: "OPTIONS",
  handler: httpAction(async (_, request) => {
    // Make sure the necessary headers are present
    // for this to be a valid pre-flight request
    const headers = request.headers;
    if (
      headers.get("Origin") !== null &&
      headers.get("Access-Control-Request-Method") !== null &&
      headers.get("Access-Control-Request-Headers") !== null
    ) {
      return new Response(null, {
        headers: new Headers({
          "Access-Control-Allow-Origin": process.env.FRONTEND_URL || "http://localhost:5173",
          "Access-Control-Allow-Methods": "POST",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
          "Access-Control-Allow-Credentials": "true",
          "Access-Control-Max-Age": "86400",
        }),
      });
    } else {
      return new Response();
    }
  }),
});

http.route({
  path: "/api/auth/webhook",
  method: "POST",
  handler: httpAction(async (_, request) => {
    // Make sure the necessary headers are present
    // for this to be a valid pre-flight request
    const headers = request.headers;
    if (
      headers.get("Origin") !== null &&
      headers.get("Access-Control-Request-Method") !== null &&
      headers.get("Access-Control-Request-Headers") !== null
    ) {
      return new Response(null, {
        headers: new Headers({
          "Access-Control-Allow-Origin": process.env.FRONTEND_URL || "http://localhost:5173",
          "Access-Control-Allow-Methods": "POST",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
          "Access-Control-Allow-Credentials": "true",
          "Access-Control-Max-Age": "86400",
        }),
      });
    } else {
      return new Response();
    }
  }),
});

http.route({
  path: "/payments/webhook",
  method: "POST",
  handler: paymentWebhook,
});

// OAuth callbacks
http.route({
  path: "/oauth/google-ads/callback",
  method: "GET",
  handler: googleOAuthCallback,
});

http.route({
  path: "/oauth/gmail/callback",
  method: "GET",
  handler: googleOAuthCallback,
});

// Duplicate routes under /api/* in caso alcuni proxy o ambienti richiedano prefisso
http.route({
  path: "/api/oauth/google-ads/callback",
  method: "GET",
  handler: googleOAuthCallback,
});

http.route({
  path: "/api/oauth/gmail/callback",
  method: "GET",
  handler: googleOAuthCallback,
});

// Download EML by report id (query ?id=...)
http.route({
  path: "/reports/download/eml",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return new Response("Missing id", { status: 400 });
    // We cannot get auth in httpAction; for MVP only, fetch directly.
    const report = await ctx.runQuery(api.reports.getReportById as any, { id } as any).catch(() => null);
    if (!report) return new Response("Not found", { status: 404 });
    const content = `From: noreply@example.com\nTo: client@example.com\nSubject: ${report.subject}\nMIME-Version: 1.0\nContent-Type: text/html; charset=\"UTF-8\"\n\n${report.html}`;
    return new Response(content, {
      status: 200,
      headers: {
        "Content-Type": "message/rfc822",
        "Content-Disposition": `attachment; filename=report-${report._id}.eml`,
      },
    });
  }),
});

// Log that routes are configured
console.log("HTTP routes configured");

// Convex expects the router to be the default export of `convex/http.js`.
export default http;
