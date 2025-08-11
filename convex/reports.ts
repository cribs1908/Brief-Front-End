import { action, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";
import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";

type Metrics = {
  campaign: string;
  clicks: number;
  impressions: number;
  ctr: number; // 0-1
  costMicros: number;
  conversions: number;
  conversionsValue?: number;
  averageCpcMicros?: number;
};

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function computeDiff(current: Metrics[], previous: Metrics[]) {
  const prevByCampaign = new Map(previous.map((m) => [m.campaign, m]));
  return current.map((m) => {
    const p = prevByCampaign.get(m.campaign);
    return {
      ...m,
      diffClicks: p ? m.clicks - p.clicks : m.clicks,
      diffCtr: p ? m.ctr - p.ctr : m.ctr,
      diffConv: p ? m.conversions - p.conversions : m.conversions,
      diffCostMicros: p ? m.costMicros - p.costMicros : m.costMicros,
    };
  });
}

async function fetchGoogleAdsCampaignMetrics({
  accessToken,
  customerId,
  loginCustomerId,
  startDate,
  endDate,
}: {
  accessToken: string;
  customerId: string;
  loginCustomerId?: string | null;
  startDate: string;
  endDate: string;
}): Promise<Metrics[]> {
  const url = `https://googleads.googleapis.com/v15/customers/${customerId}/googleAds:search`;
  const gaql = `SELECT campaign.name, metrics.clicks, metrics.impressions, metrics.ctr, metrics.cost_micros, metrics.conversions, metrics.conversions_value, metrics.average_cpc FROM campaign WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(loginCustomerId ? { "login-customer-id": loginCustomerId } : {}),
      ...(process.env.GOOGLE_ADS_DEVELOPER_TOKEN
        ? { "developer-token": process.env.GOOGLE_ADS_DEVELOPER_TOKEN as string }
        : {}),
    },
    body: JSON.stringify({ query: gaql, pageSize: 1000 }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google Ads API error: ${text}`);
  }
  const data = await res.json();
  const rows = (data.results || []) as any[];
  return rows.map((r) => ({
    campaign: r.campaign.name,
    clicks: Number(r.metrics.clicks || 0),
    impressions: Number(r.metrics.impressions || 0),
    ctr: Number(r.metrics.ctr || 0) / 100, // API returns percentage?
    costMicros: Number(r.metrics.costMicros || r.metrics.cost_micros || 0),
    conversions: Number(r.metrics.conversions || 0),
    conversionsValue: Number(r.metrics.conversionsValue || r.metrics.conversions_value || 0),
    averageCpcMicros: Number(r.metrics.averageCpc || r.metrics.average_cpc || 0),
  }));
}

function pickInsights(diff: ReturnType<typeof computeDiff>) {
  const byPositive = [...diff].sort((a, b) => (b.diffConv || 0) - (a.diffConv || 0));
  const byNegative = [...diff].sort((a, b) => (a.diffConv || 0) - (b.diffConv || 0));
  const wins = byPositive.slice(0, 5).map((m) => `Campagna ${m.campaign}: conversioni ${m.diffConv >= 0 ? "+" : ""}${m.diffConv.toFixed(0)}; CTR ${(m.ctr * 100).toFixed(2)}%`);
  const risks = byNegative.slice(0, 5).map((m) => `Campagna ${m.campaign}: conversioni ${m.diffConv >= 0 ? "+" : ""}${m.diffConv.toFixed(0)}; costo ${(m.costMicros / 1_000_000).toFixed(2)}€`);
  const actions = [
    "Aumentare budget sulle campagne con trend positivo",
    "Ottimizzare keyword e creatività sulle campagne in calo",
    "Valutare riallocazione budget dalle campagne inefficienti",
  ];
  return { wins, risks, actions };
}

function createMockData(): { current: Metrics[]; previous: Metrics[] } {
  const campaigns = [
    "Brand IT",
    "Search Generic",
    "Shopping Core",
    "Display Prospecting",
    "YouTube Awareness",
    "Retargeting All",
  ];
  const rand = (min: number, max: number) => Math.random() * (max - min) + min;

  const previous: Metrics[] = campaigns.map((name) => {
    const clicks = Math.round(rand(500, 3000));
    const impressions = clicks * Math.round(rand(10, 40));
    const ctr = clicks / Math.max(1, impressions);
    const costMicros = Math.round(rand(200, 1500)) * 1_000_000;
    const conversions = Math.max(0, Math.round(rand(5, 80)));
    const averageCpcMicros = Math.round(costMicros / Math.max(1, clicks));
    const conversionsValue = Math.round(conversions * rand(20, 150));
    return { campaign: name, clicks, impressions, ctr, costMicros, conversions, averageCpcMicros, conversionsValue };
  });

  const current: Metrics[] = previous.map((p) => {
    const change = rand(0.8, 1.2);
    const clicks = Math.max(1, Math.round(p.clicks * change));
    const impressions = Math.max(clicks, Math.round(p.impressions * change * rand(0.9, 1.1)));
    const ctr = clicks / impressions;
    const costMicros = Math.max(100_000, Math.round(p.costMicros * change * rand(0.9, 1.15)));
    const conversions = Math.max(0, Math.round(p.conversions * change * rand(0.8, 1.25)));
    const averageCpcMicros = Math.round(costMicros / Math.max(1, clicks));
    const conversionsValue = Math.round(conversions * rand(20, 150));
    return { campaign: p.campaign, clicks, impressions, ctr, costMicros, conversions, averageCpcMicros, conversionsValue };
  });

  return { current, previous };
}

function buildEmail({
  clientName,
  periodLabel,
  intro,
  wins,
  risks,
  actions,
  signature,
}: {
  clientName: string;
  periodLabel: string;
  intro: string;
  wins: string[];
  risks: string[];
  actions: string[];
  signature: string;
}) {
  const subject = `Aggiornamento performance Google Ads – ${clientName} (${periodLabel})`;
  const html = `<!doctype html><html><body style="font-family:Inter,ui-sans-serif,sans-serif;color:#0b1e27;background:#fff;">
  <p>${intro}</p>
  <h3>5 Win</h3>
  <ul>${wins.map((w) => `<li>${w}</li>`).join("")}</ul>
  <h3>5 Rischi</h3>
  <ul>${risks.map((r) => `<li>${r}</li>`).join("")}</ul>
  <h3>3 Azioni</h3>
  <ul>${actions.map((a) => `<li>${a}</li>`).join("")}</ul>
  <pre style="white-space:pre-wrap;margin-top:16px;border-top:1px solid #eee;padding-top:8px;">${signature}</pre>
  </body></html>`;
  const text = `${intro}\n\nWin:\n- ${wins.join("\n- ")}\n\nRischi:\n- ${risks.join("\n- ")}\n\nAzioni:\n- ${actions.join("\n- ")}\n\n${signature}`;
  return { subject, html, text };
}

async function buildAIPreamble({ language, tone }: { language: string; tone: string }) {
  return `Scrivi in ${language} con tono ${tone}. Testo chiaro per non addetti ai lavori.`;
}

export const generateReport = action({
  args: {
    clientId: v.id("clients"),
    periodStart: v.number(),
    periodEnd: v.number(),
    language: v.string(),
    tone: v.string(),
    signature: v.optional(v.string()),
    notes: v.optional(v.string()),
    model: v.optional(v.string()),
    useMock: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<any> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Non autenticato");
    const client = await ctx.runQuery(api.clients.listClients).then((cs: any[]) => cs.find((c: any) => c._id === args.clientId));
    if (!client || client.userTokenIdentifier !== identity.subject) throw new Error("Cliente non trovato");

    const customerId = client.googleAdsCustomerId || (client._id === ("TEST_PLACEHOLDER" as any) ? "TEST" : undefined);
    const isTest = !!args.useMock || customerId === "TEST" || client._id === ("TEST_PLACEHOLDER" as any);
    if (!customerId) throw new Error("Cliente senza Google Ads customerId");

    // current period
    const start = formatDate(new Date(args.periodStart));
    const end = formatDate(new Date(args.periodEnd));

    // previous period (same length immediately before)
    const ms = args.periodEnd - args.periodStart + 24 * 60 * 60 * 1000;
    const prevStart = formatDate(new Date(args.periodStart - ms));
    const prevEnd = formatDate(new Date(args.periodStart - 24 * 60 * 60 * 1000));

    // fetch metrics
    let current: Metrics[] = [];
    let previous: Metrics[] = [];
    if (isTest) {
      const mock = createMockData();
      current = mock.current;
      previous = mock.previous;
    } else {
      const { accessToken } = await ctx.runAction(api.integrations.ensureAccessToken, { service: "google_ads" });
      const integration: any = await ctx.runQuery(api.integrations.getIntegrationByUserService, {
        userTokenIdentifier: identity.subject,
        service: "google_ads",
      });
      const loginCustomerId = integration?.loginCustomerId ?? undefined;
      [current, previous] = await Promise.all([
        fetchGoogleAdsCampaignMetrics({ accessToken, customerId, loginCustomerId, startDate: start, endDate: end }),
        fetchGoogleAdsCampaignMetrics({ accessToken, customerId, loginCustomerId, startDate: prevStart, endDate: prevEnd }),
      ]);
    }

    const diff = computeDiff(current, previous);

    // Prompt strutturato per generare soggetto, intro, win/riski/azioni
    const preamble = await buildAIPreamble({ language: args.language, tone: args.tone });
    let generatedSubject: string | null = null;
    let generatedIntro: string | null = null;
    let generatedWins: string[] | null = null;
    let generatedRisks: string[] | null = null;
    let generatedActions: string[] | null = null;

    const promptPayload = {
      client: { name: client.name },
      period: { start, end },
      language: args.language,
      tone: args.tone,
      notes: args.notes || "",
      metrics: { current, previous, diff },
      requirements: {
        subject: true,
        intro: { sentences: "2-3" },
        wins: 5,
        risks: 5,
        actions: 3,
      },
      output_format: {
        type: "json",
        schema: {
          subject: "string",
          intro: "string",
          wins: ["string"],
          risks: ["string"],
          actions: ["string"],
        },
      },
    };

    try {
      if (process.env.OPENAI_API_KEY) {
        const { text } = await generateText({
          model: openai(args.model || "gpt-4o-mini"),
          prompt:
            `${preamble}\n` +
            `Sei un assistente che scrive email di update per Google Ads basandoti su dati strutturati. ` +
            `Usa i dati forniti per identificare 5 "Win" (risultati positivi, con riferimenti a campagne e KPI), ` +
            `5 "Rischi" (criticità e cali, con riferimenti a campagne e KPI), ` +
            `e 3 "Azioni" (raccomandazioni operative concrete). ` +
            `Mantieni il linguaggio semplice per non addetti ai lavori. ` +
            `Rispetta eventuali note del consulente se presenti. ` +
            `Restituisci esclusivamente un JSON valido che rispetti esattamente lo schema richiesto, senza testo aggiuntivo o code fences.\n\n` +
            `Dati di contesto (JSON):\n` +
            `${JSON.stringify(promptPayload)}`,
          temperature: 0.2,
        });
        if (text) {
          const cleaned = text
            .trim()
            .replace(/^```json\n?|^```\n?|```$/g, "");
          try {
            const obj = JSON.parse(cleaned);
            generatedSubject = typeof obj.subject === "string" ? obj.subject : null;
            generatedIntro = typeof obj.intro === "string" ? obj.intro : null;
            generatedWins = Array.isArray(obj.wins) ? obj.wins.slice(0, 5) : null;
            generatedRisks = Array.isArray(obj.risks) ? obj.risks.slice(0, 5) : null;
            generatedActions = Array.isArray(obj.actions) ? obj.actions.slice(0, 3) : null;
          } catch (e) {
            console.warn("AI JSON parse error", e);
          }
        }
      }
    } catch (e) {
      console.warn("AI generation fallback:", e);
    }

    // Fallback a euristiche locali se necessario
    const fallbackInsights = pickInsights(diff);
    const subjectForEmail =
      generatedSubject || `Aggiornamento performance Google Ads – ${client.name} (${start} – ${end})`;
    const introForEmail =
      generatedIntro || `${preamble} Di seguito i principali risultati del periodo ${start} – ${end}.`;
    const winsForEmail = generatedWins || fallbackInsights.wins;
    const risksForEmail = generatedRisks || fallbackInsights.risks;
    const actionsForEmail = generatedActions || fallbackInsights.actions;

    const { subject, html, text } = buildEmail({
      clientName: client.name,
      periodLabel: `${start} – ${end}`,
      intro: introForEmail,
      wins: winsForEmail,
      risks: risksForEmail,
      actions: actionsForEmail,
      signature: args.signature || client.preferences?.signature || "",
    });

    const now = Date.now();
    const reportId: any = await ctx.runMutation(api.reports.insertReport, {
      userTokenIdentifier: identity.subject,
      clientId: args.clientId,
      periodStart: args.periodStart,
      periodEnd: args.periodEnd,
      status: "bozza",
      subject,
      html,
      text,
      createdAt: now,
      updatedAt: now,
    });
    return await ctx.runQuery(api.reports.getReportById, { id: reportId });
  },
});

export const listReports = query({
  args: {
    clientId: v.optional(v.id("clients")),
    from: v.optional(v.number()),
    to: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    let q = ctx.db.query("reports").withIndex("by_user", (q) => q.eq("userTokenIdentifier", identity.subject));
    const all = await q.collect();
    return all.filter((r) => {
      if (args.clientId && r.clientId !== args.clientId) return false;
      if (args.from && r.periodStart < args.from) return false;
      if (args.to && r.periodEnd > args.to) return false;
      return true;
    }).sort((a, b) => b.createdAt - a.createdAt);
  },
});

function base64UrlEncode(str: string) {
  const base64 = btoa(unescape(encodeURIComponent(str)));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function buildEml({ from, to, subject, html }: { from?: string; to: string; subject: string; html: string }) {
  const boundary = "mixed_boundary";
  const fromHeader = from ? `From: ${from}\n` : "";
  return `${fromHeader}To: ${to}\nSubject: ${subject}\nMIME-Version: 1.0\nContent-Type: multipart/alternative; boundary=\"${boundary}\"\n\n--${boundary}\nContent-Type: text/html; charset=\"UTF-8\"\n\n${html}\n\n--${boundary}--`;
}

export const createGmailDraft = action({
  args: { reportId: v.id("reports") },
  handler: async (ctx, args): Promise<{ draftId: string }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Non autenticato");
    const report: any = await ctx.runQuery(api.reports.getReportById, { id: args.reportId });
    if (!report || report.userTokenIdentifier !== identity.subject) throw new Error("Report non trovato");
    const client: any = await ctx.runQuery(api.clients.listClients as any).then((cs: any[]) => cs.find((c) => c._id === report.clientId));
    const toEmail: string = client?.preferences?.email || "info@gmail.com";
    // ensure Gmail access token
    const { accessToken }: any = await ctx.runAction(api.integrations.ensureAccessToken, { service: "gmail" });
    const raw = buildEml({ to: toEmail, subject: report.subject, html: report.html });
    const rawEncoded = base64UrlEncode(raw);
    const res: any = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/drafts", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ message: { raw: rawEncoded } }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Gmail draft error: ${text}`);
    }
    const data: any = await res.json();
    await ctx.runMutation(api.reports.patchReport, { id: args.reportId, gmailDraftId: data.id });
    return { draftId: data.id };
  },
});

export const sendGmailMessage = action({
  args: { reportId: v.id("reports") },
  handler: async (ctx, args): Promise<{ messageId: string }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Non autenticato");
    const report: any = await ctx.runQuery(api.reports.getReportById, { id: args.reportId });
    if (!report || report.userTokenIdentifier !== identity.subject) throw new Error("Report non trovato");
    const client: any = await ctx.runQuery(api.clients.listClients as any).then((cs: any[]) => cs.find((c) => c._id === report.clientId));
    const toEmail: string = client?.preferences?.email || "info@gmail.com";
    const { accessToken }: any = await ctx.runAction(api.integrations.ensureAccessToken, { service: "gmail" });
    const raw = buildEml({ to: toEmail, subject: report.subject, html: report.html });
    const rawEncoded = base64UrlEncode(raw);
    const res: any = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ raw: rawEncoded }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Gmail send error: ${text}`);
    }
    const data: any = await res.json();
    await ctx.runMutation(api.reports.patchReport, { id: args.reportId, gmailMessageId: data.id } as any);
    await ctx.runMutation(api.reports.markReportSent, { reportId: args.reportId });
    return { messageId: data.id };
  },
});

export const markReportSent = mutation({
  args: { reportId: v.id("reports") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Non autenticato");
    const report = await ctx.db.get(args.reportId);
    if (!report || report.userTokenIdentifier !== identity.subject) throw new Error("Report non trovato");
    await ctx.db.patch(args.reportId, { status: "inviato", updatedAt: Date.now() });
    return await ctx.db.get(args.reportId);
  },
});

// DB helpers for actions
export const insertReport = mutation({
  args: {
    userTokenIdentifier: v.string(),
    clientId: v.id("clients"),
    periodStart: v.number(),
    periodEnd: v.number(),
    status: v.union(v.literal("bozza"), v.literal("inviato"), v.literal("errore")),
    subject: v.string(),
    html: v.string(),
    text: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("reports", args);
  },
});

export const getReportById = query({
  args: { id: v.id("reports") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const patchReport = mutation({
  args: {
    id: v.id("reports"),
    gmailDraftId: v.optional(v.string()),
    gmailMessageId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const patch: any = { updatedAt: Date.now() };
    if (args.gmailDraftId !== undefined) patch.gmailDraftId = args.gmailDraftId;
    if (args.gmailMessageId !== undefined) patch.gmailMessageId = args.gmailMessageId;
    await ctx.db.patch(args.id, patch);
  },
});


