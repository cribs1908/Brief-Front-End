import express from "express";
import cors from "cors";
import { z } from "zod";
import { once } from "node:events";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { createWriteStream, promises as fs } from "node:fs";
import { join } from "node:path";
// Usa la build legacy di PDF.js per compatibilità Node 18/20 (evita Promise.withResolvers di Node 22)
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { request } from "undici";

const PORT = Number(process.env.PORT || 8787);
const MAX_PDF_BYTES = Number(process.env.MAX_PDF_BYTES || 25 * 1024 * 1024); // 25MB default
const REQ_TIMEOUT_MS = Number(process.env.REQ_TIMEOUT_MS || 120000); // 120s
const PROC_TIMEOUT_MS = Number(process.env.PROC_TIMEOUT_MS || 60000); // 60s for OCR/Tabula
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";
const ALLOW_HTTP = process.env.ALLOW_HTTP === "true"; // default disallow plain http

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(
  cors({
    origin: (origin, cb) => cb(null, ALLOWED_ORIGIN === "*" ? true : origin === ALLOWED_ORIGIN),
    credentials: true,
  })
);

const ExtractInput = z.object({
  pdf_url: z.string().url(),
  hints: z
    .object({
      is_scanned: z.boolean().optional(),
      expected_language: z.string().optional(),
      max_pages: z.number().int().positive().optional(),
    })
    .optional(),
});

type Table = { page: number; rows: string[][]; bbox?: [number, number, number, number] };
type TextBlock = { page: number; text: string };

function sanitizeText(s: string): string {
  // rimuove sillabazioni e spaziature inutili, normalizza whitespace
  const noHyphenBreak = s.replace(/([A-Za-z])-(\n|\r\n)([A-Za-z])/g, "$1$3");
  const normalized = noHyphenBreak.replace(/\s+\n/g, "\n").replace(/\n{2,}/g, "\n\n");
  // rimuovi numeri di pagina semplici (euristica)
  return normalized.replace(/^\s*page\s*\d+\s*$/gim, "");
}

function validateUrl(url: string) {
  try {
    const u = new URL(url);
    if (!(u.protocol === "https:" || (ALLOW_HTTP && u.protocol === "http:"))) {
      throw { code: "PDF_FETCH_FAILED", message: "Unsupported URL scheme" };
    }
    if (u.hostname === "localhost" || u.hostname === "127.0.0.1") {
      // Disallow loopback to avoid SSRF to local services
      throw { code: "PDF_FETCH_FAILED", message: "Loopback not allowed" };
    }
  } catch (e) {
    throw { code: "PDF_FETCH_FAILED", message: "Invalid URL" };
  }
}

async function fetchToTempFile(url: string): Promise<{ path: string; bytes: number }> {
  validateUrl(url);
  let res;
  try {
    res = await request(url, { maxRedirections: 3, headersTimeout: REQ_TIMEOUT_MS, bodyTimeout: REQ_TIMEOUT_MS });
  } catch (e: any) {
    if (/Timeout/i.test(String(e?.name)) || /Timeout/i.test(String(e?.message))) {
      throw { code: "TIMEOUT", message: "Download timeout" };
    }
    throw { code: "PDF_FETCH_FAILED", message: e?.message || "Fetch failed" };
  }
  const { body, statusCode, headers } = res;
  if (statusCode < 200 || statusCode >= 300) throw { code: "PDF_FETCH_FAILED", message: `HTTP ${statusCode}` };
  const contentLength = Number(headers["content-length"]) || 0;
  if (contentLength && contentLength > MAX_PDF_BYTES) throw { code: "UNSUPPORTED_PDF", message: "File troppo grande" };
  const tmp = join(tmpdir(), `processor_${Date.now()}_${Math.random().toString(36).slice(2)}.pdf`);
  const ws = createWriteStream(tmp);
  let total = 0;
  await new Promise<void>((resolve, reject) => {
    body.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > MAX_PDF_BYTES) {
        ws.destroy();
        body.destroy();
        reject({ code: "UNSUPPORTED_PDF", message: "File troppo grande" });
        return;
      }
      ws.write(chunk);
    });
    body.on("end", () => {
      ws.end();
      resolve();
    });
    body.on("error", reject);
  });
  return { path: tmp, bytes: total };
}

async function runTesseract(inputPath: string, lang?: string): Promise<string> {
  // tesseract <input> stdout -l <lang> --psm 3
  return await new Promise<string>((resolve, reject) => {
    const args = [inputPath, "stdout"];
    if (lang) args.push("-l", lang);
    const proc = spawn("tesseract", args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    proc.stdout.on("data", (d) => (out += d.toString("utf8")));
    proc.stderr.on("data", (d) => (err += d.toString("utf8")));
    const to = setTimeout(() => {
      try { proc.kill("SIGKILL"); } catch {}
      reject({ code: "TIMEOUT", message: "OCR timeout" });
    }, PROC_TIMEOUT_MS);
    proc.on("error", (e) => {
      clearTimeout(to);
      reject({ code: "OCR_FAILED", message: String(e) });
    });
    proc.on("close", (code) => {
      clearTimeout(to);
      if (code === 0) resolve(out);
      else reject({ code: "OCR_FAILED", message: err || `Exit ${code}` });
    });
  });
}

async function runTabulaTables(inputPath: string, pageSpec: string): Promise<Table[]> {
  // requires tabula-java in PATH (java -Dfile.encoding=UTF8 -jar tabula.jar -p <pages> -f JSON <file>)
  return await new Promise<Table[]>((resolve, reject) => {
    const args = ["-jar", process.env.TABULA_JAR_PATH || "tabula.jar", "-p", pageSpec, "-f", "JSON", inputPath];
    const proc = spawn("java", args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    proc.stdout.on("data", (d) => (out += d.toString("utf8")));
    proc.stderr.on("data", (d) => (err += d.toString("utf8")));
    const to = setTimeout(() => {
      try { proc.kill("SIGKILL"); } catch {}
      reject({ code: "TIMEOUT", message: "Tabula timeout" });
    }, PROC_TIMEOUT_MS);
    proc.on("error", (e) => {
      clearTimeout(to);
      reject({ code: "TABLE_EXTRACTION_FAILED", message: String(e) });
    });
    proc.on("close", (code) => {
      clearTimeout(to);
      if (code !== 0) return reject({ code: "TABLE_EXTRACTION_FAILED", message: err || `Exit ${code}` });
      try {
        const raw = JSON.parse(out);
        const tables: Table[] = [];
        for (const t of raw) {
          const rows: string[][] = (t.data || []).map((row: any[]) => row.map((cell: any) => String(cell.text ?? "").replace(/\s+/g, " ").trim()));
          if (rows.length === 0 || rows.every((r: string[]) => r.every((c) => c === ""))) continue;
          const page = t.page || 1;
          const bbox = t.bounding_box ? [t.bounding_box.top, t.bounding_box.left, t.bounding_box.width, t.bounding_box.height] : undefined;
          tables.push({ page, rows, bbox: bbox as any });
        }
        resolve(tables);
      } catch (e: any) {
        reject({ code: "TABLE_EXTRACTION_FAILED", message: e?.message || String(e) });
      }
    });
  });
}

function sendError(res: express.Response, code: string, message: string, details?: any, status = 400) {
  return res.status(status).json({ code, message, details });
}

app.post("/extract", async (req, res) => {
  const parse = ExtractInput.safeParse(req.body);
  if (!parse.success) {
    return sendError(res, "INTERNAL_ERROR", "Invalid input", parse.error.issues.slice(0, 3));
  }

  const { pdf_url, hints } = parse.data;
  const logs: string[] = [];
  let tmp: string | null = null;
  let ocr_used = false;
  try {
    const { path: tmpPath } = await fetchToTempFile(pdf_url);
    tmp = tmpPath;

    const pdfBuf = await fs.readFile(tmpPath);
    // Disabilita il worker in ambiente Node
    try { ((pdfjsLib as any).GlobalWorkerOptions ||= {}).workerSrc = undefined; } catch {}
    const loadingTask = (pdfjsLib as any).getDocument({ data: pdfBuf });
    const doc = await loadingTask.promise;
    const pages = doc.numPages || 0;
    const maxPages = hints?.max_pages && pages ? Math.min(hints.max_pages, pages) : pages;

    let textBlocks: TextBlock[] = [];
    let tables: Table[] = [];

    // Heuristic: if no text or forced is_scanned, OCR
    // Try to detect if any page has selectable text (rough heuristic)
    let hasNativeText = false;
    for (let i = 1; i <= Math.min(pages, 3); i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      if (content.items && content.items.length > 5) {
        hasNativeText = true;
        break;
      }
    }
    if (hints?.is_scanned || !hasNativeText) {
      const ocrText = await runTesseract(tmpPath, hints?.expected_language);
      ocr_used = true;
      const perPage = ocrText.split(/\f/g); // form feed splits
      for (let i = 0; i < perPage.length && (!maxPages || i < maxPages); i++) {
        const clean = sanitizeText(perPage[i]);
        if (clean.trim().length > 1) textBlocks.push({ page: i + 1, text: clean });
        logs.push(`p${i + 1}: ocr applied`);
      }
    } else {
      for (let i = 1; i <= pages && (!maxPages || i <= maxPages); i++) {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        const pieces = (content.items || []).map((it: any) => String(it.str || ""));
        const pageText = sanitizeText(pieces.join(" \n").trim());
        if (pageText.length > 1) {
          textBlocks.push({ page: i, text: pageText });
          logs.push(`p${i}: text native`);
        }
      }
    }

    // Tables via Tabula
    try {
      const pageSpec = maxPages ? `1-${maxPages}` : "all";
      tables = await runTabulaTables(tmpPath, pageSpec);
      const perPageCount: Record<number, number> = {};
      for (const t of tables) perPageCount[t.page] = (perPageCount[t.page] || 0) + 1;
      Object.keys(perPageCount).slice(0, 10).forEach((p) => logs.push(`p${p}: ${perPageCount[Number(p)]} tables found`));
    } catch (e: any) {
      logs.push(`tables: none (${e?.code || "err"})`);
      tables = [];
    }

    // Quality heuristic: ratio of non-empty pages + table presence weight
    const nonEmptyPages = new Set(textBlocks.filter((b) => b.text.trim().length > 30).map((b) => b.page)).size;
    const quality = Math.max(0, Math.min(1, (nonEmptyPages / Math.max(1, pages)) * 0.7 + (tables.length > 0 ? 0.3 : 0)));

    return res.json({
      pages,
      ocr_used,
      extraction_quality: Number(quality.toFixed(2)),
      tables,
      text_blocks: textBlocks,
      logs: logs.slice(0, 10),
    });
  } catch (e: any) {
    const code = e?.code || "INTERNAL_ERROR";
    const message = e?.message || "Unexpected error";
    const status = code === "UNSUPPORTED_PDF" ? 413 : code === "PDF_FETCH_FAILED" ? 400 : code === "TIMEOUT" ? 408 : 400;
    return sendError(res, code, message, undefined, status);
  } finally {
    if (tmp) {
      fs.unlink(tmp).catch(() => {});
    }
  }
});

app.get("/health", (_req, res) => res.json({ ok: true }));
app.get("/version", (_req, res) => res.json({ node: process.versions.node, versions: process.versions }));

app.listen(PORT, () => {
  console.log(`[processor] listening on :${PORT}`);
});


