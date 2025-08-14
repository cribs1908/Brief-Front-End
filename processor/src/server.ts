import express from "express";
import cors from "cors";
import { z } from "zod";
import { once } from "node:events";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { createWriteStream, promises as fs } from "node:fs";
import { join, extname } from "node:path";
// Usa la build legacy di PDF.js per compatibilità Node 18/20 (evita Promise.withResolvers di Node 22)
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { request } from "undici";

const PORT = Number(process.env.PORT || 8787);
const MAX_PDF_BYTES = Number(process.env.MAX_PDF_BYTES || 25 * 1024 * 1024); // 25MB default
const REQ_TIMEOUT_MS = Number(process.env.REQ_TIMEOUT_MS || 120000); // 120s
const PROC_TIMEOUT_MS = Number(process.env.PROC_TIMEOUT_MS || 60000); // 60s for OCR/Tabula
const OCR_DPI = Number(process.env.OCR_DPI || 200);
const OCR_CHUNK_PAGES = Number(process.env.OCR_CHUNK_PAGES || 5);
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

function isValidPdfStructure(buffer: Buffer): boolean {
  // Controllo più permissivo: molti PDF validi possono mancare di alcuni marker o averli compressi
  if (!buffer || buffer.length < 5) return false;
  
  // Deve iniziare con %PDF
  const header = buffer.subarray(0, 4).toString('ascii');
  if (header !== '%PDF') return false;
  
  // Verifica presenza di fine file o trailer in modo soft
  const tailSlice = buffer.subarray(Math.max(0, buffer.length - 1024));
  const tail = tailSlice.toString('binary');
  const hasEOF = /%%EOF/i.test(tail);
  // Non richiediamo xref esplicito, spesso è compresso o indiretto
  return hasEOF || buffer.length > 1024; // euristica: se c'è EOF o file è abbastanza grande
}

async function handlePdfWithOcrOnly(inputPath: string, hints: any, logs: string[]): Promise<any> {
  // Strategia per PDF corrotti: solo OCR, nessuna analisi strutturale
  logs.push("Using OCR-only strategy for corrupted/invalid PDF");
  
  let textBlocks: TextBlock[] = [];
  let tables: Table[] = [];
  let pages = 1; // Assumiamo una pagina se non riusciamo a determinarla
  
  try {
    // Strategia 1: Prova pdftoppm per rasterizzare
    const totalPages = await getPdfPageCount(inputPath);
    const maxPages = hints?.max_pages && hints.max_pages > 0 ? Math.min(hints.max_pages, totalPages) : totalPages;
    // Rasterizza a chunk per evitare picchi di memoria su PDF lunghi
    const images: string[] = [];
    const chunk = Math.max(1, Math.min(OCR_CHUNK_PAGES, 25));
    for (let start = 1; start <= maxPages; start += chunk) {
      const end = Math.min(maxPages, start + chunk - 1);
      const part = await rasterizePdfToImages(inputPath, start, end);
      images.push(...part);
      logs.push(`Rasterized pages ${start}-${end}`);
    }
    pages = images.length || 1;
    
    for (let i = 0; i < images.length; i++) {
      const imgPath = images[i];
      try {
         const txt = await runTesseractOnImage(imgPath, hints?.expected_language);
        const clean = sanitizeText(txt);
        if (clean.trim().length > 1) {
          textBlocks.push({ page: i + 1, text: clean });
        }
        logs.push(`OCR p${i + 1}: extracted ${clean.length} chars`);
      } catch (ocrErr) {
        logs.push(`OCR p${i + 1}: failed - ${String(ocrErr)}`);
      }
      
      // Cleanup immagine temporanea
      try { await fs.unlink(imgPath); } catch {}
    }
  } catch (rasterError: any) {
    logs.push(`pdftoppm failed: ${rasterError?.message || String(rasterError)}`);
    
    // Strategia 2: Prova tesseract diretto su PDF (limitato ma può funzionare)
    try {
      const txt = await runTesseractOnImage(inputPath, hints?.expected_language);
      const clean = sanitizeText(txt);
      if (clean.trim().length > 1) {
        textBlocks.push({ page: 1, text: clean });
        logs.push(`Direct OCR: extracted ${clean.length} chars`);
      } else {
        logs.push("Direct OCR: no readable text found");
      }
    } catch (directOcrErr) {
      logs.push(`Direct OCR failed: ${String(directOcrErr)}`);
      // Se tutto fallisce, restituisci almeno un messaggio informativo
      textBlocks.push({ 
        page: 1, 
        text: "PDF extraction failed: File appears to be corrupted or contains only non-extractable content." 
      });
    }
  }
  
  // Tabula chunked su PDF lunghi
  try {
    tables = await extractTablesInChunks(inputPath, pages, hints, logs);
    if (tables.length > 0) logs.push(`Tabula extracted total ${tables.length} tables`);
  } catch (tabulaErr: any) {
    logs.push(`Tabula failed: ${tabulaErr?.message || String(tabulaErr)}`);
  }
  
  // Se nessun testo estratto, fornisci un blocco informativo minimo per evitare catene vuote
  if (textBlocks.length === 0) {
    textBlocks.push({ page: 1, text: "OCR did not extract readable text. The document may be image-only, low resolution, or non-Latin script." });
  }
  
  // Calcola qualità basata su OCR recovery
  const totalText = textBlocks.reduce((sum, block) => sum + block.text.length, 0);
  const quality = Math.min(1, Math.max(0.1, (totalText / 500) * 0.6 + (tables.length > 0 ? 0.4 : 0)));
  
  return {
    pages,
    ocr_used: true,
    extraction_quality: Number(quality.toFixed(2)),
    tables,
    text_blocks: textBlocks,
    logs: logs.slice(-15), // Ultimi 15 log per debugging
  };
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

async function runTesseractOnImage(inputPath: string, lang?: string): Promise<string> {
  // tesseract <input> stdout -l <lang> --oem 1 --psm 3
  return await new Promise<string>((resolve, reject) => {
    const args = [inputPath, "stdout", "--oem", "1", "--psm", "3"]; // OEM 1: LSTM only, PSM 3: fully automatic page segmentation
    const language = lang && lang.trim() ? lang : "eng+ita";
    args.push("-l", language);
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

async function rasterizePdfToImages(inputPath: string, fromPage = 1, toPage?: number): Promise<string[]> {
  return await new Promise<string[]>((resolve, reject) => {
    const prefix = join(tmpdir(), `raster_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    const args = ["-png", "-f", String(fromPage)];
    if (toPage) args.push("-l", String(toPage));
    args.push("-r", String(OCR_DPI), inputPath, prefix);
    const proc = spawn("pdftoppm", args, { stdio: ["ignore", "inherit", "pipe"] });
    let err = "";
    const to = setTimeout(() => {
      try { proc.kill("SIGKILL"); } catch {}
      reject({ code: "TIMEOUT", message: "pdftoppm timeout" });
    }, PROC_TIMEOUT_MS);
    proc.stderr.on("data", (d) => (err += d.toString("utf8")));
    proc.on("error", (e) => {
      clearTimeout(to);
      reject({ code: "OCR_FAILED", message: `pdftoppm error: ${String(e)}` });
    });
    proc.on("close", async (code) => {
      clearTimeout(to);
      if (code !== 0) return reject({ code: "OCR_FAILED", message: err || `pdftoppm exit ${code}` });
      // Collect files prefix-<n>.png
      const paths: string[] = [];
      const last = toPage ?? fromPage; // best effort
      for (let i = fromPage; i <= last; i++) {
        const p = `${prefix}-${i}.png`;
        try {
          await fs.access(p);
          paths.push(p);
        } catch {}
      }
      // If no numbered files, maybe single file
      if (paths.length === 0) {
        const single = `${prefix}.png`;
        try { await fs.access(single); paths.push(single); } catch {}
      }
      resolve(paths);
    });
  });
}

async function getPdfPageCount(inputPath: string): Promise<number> {
  return await new Promise<number>((resolve) => {
    const proc = spawn("pdfinfo", [inputPath], { stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    proc.stdout.on("data", (d) => (out += d.toString("utf8")));
    proc.on("close", () => {
      const m = out.match(/Pages:\s+(\d+)/i);
      resolve(m ? Number(m[1]) : 1);
    });
    proc.on("error", () => resolve(1));
  });
}

async function extractTablesInChunks(inputPath: string, totalPages: number, hints: any, logs: string[]): Promise<Table[]> {
  const tables: Table[] = [];
  const chunk = Math.max(1, Math.min(OCR_CHUNK_PAGES, 25));
  for (let start = 1; start <= totalPages; start += chunk) {
    const end = Math.min(totalPages, start + chunk - 1);
    try {
      const part = await runTabulaTables(inputPath, `${start}-${end}`);
      tables.push(...part);
      logs.push(`Tabula: pages ${start}-${end}: +${part.length} tables`);
    } catch (e: any) {
      logs.push(`Tabula failed on pages ${start}-${end}: ${e?.message || String(e)}`);
    }
  }
  return tables;
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
    
    // Validazione base della struttura PDF
    // Se fallisce, non interrompere: usa fallback OCR-only e restituisci 200
    if (!isValidPdfStructure(pdfBuf)) {
      logs.push("Base PDF validation failed: structure not recognized. Falling back to OCR-only mode");
      const result = await handlePdfWithOcrOnly(tmpPath, hints, logs);
      return res.json(result);
    }
    
    // Disabilita il worker in ambiente Node
    try { ((pdfjsLib as any).GlobalWorkerOptions ||= {}).workerSrc = undefined; } catch {}
    
    let doc;
    try {
      const loadingTask = (pdfjsLib as any).getDocument({ 
        data: new Uint8Array(pdfBuf),
        // Opzioni per gestire PDF problematici
        stopAtErrors: false,
        maxImageSize: 1024 * 1024 * 10, // 10MB max per singola immagine
        isEvalSupported: false,
        fontExtraProperties: false
      });
      doc = await loadingTask.promise;
    } catch (pdfError: any) {
      logs.push(`PDF.js loading failed: ${pdfError?.message || String(pdfError)}`);
      
      // Categorizza l'errore PDF.js per fallback appropriato
      if (pdfError?.message?.includes("Invalid PDF structure") || 
          pdfError?.message?.includes("Invalid or corrupted PDF") ||
          pdfError?.message?.includes("PDF header not found") ||
          pdfError?.name === "InvalidPDFException") {
        // Fallback: prova solo OCR senza analisi strutturale
        logs.push("PDF structure invalid, attempting OCR-only extraction");
        return await handlePdfWithOcrOnly(tmpPath, hints, logs);
      } else if (pdfError?.message?.includes("password") || 
                 pdfError?.message?.includes("encrypted")) {
        throw { code: "UNSUPPORTED_PDF", message: "PDF is password-protected" };
      } else {
        throw { code: "UNSUPPORTED_PDF", message: `PDF loading failed: ${pdfError?.message || "Unknown error"}` };
      }
    }
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
      // Rasterizza PDF in PNG e poi OCR per compatibilità con tesseract
      let pagesTo = maxPages && maxPages > 0 ? maxPages : undefined;
      let images: string[] = [];
      try {
        images = await rasterizePdfToImages(tmpPath, 1, pagesTo);
      } catch (e: any) {
        // fallback: prova direttamente tesseract (alcune build hanno supporto pdf limitato)
        try {
          const txt = await runTesseractOnImage(tmpPath, hints?.expected_language);
          images = [];
          logs.push("fallback: direct tesseract on pdf");
          // Tratta come pagina unica
          if (txt.trim()) {
            textBlocks.push({ page: 1, text: sanitizeText(txt) });
            ocr_used = true;
          }
        } catch (err) {
          throw err;
        }
      }
      for (let i = 0; i < images.length && (!maxPages || i < maxPages); i++) {
        const imgPath = images[i];
        const txt = await runTesseractOnImage(imgPath, hints?.expected_language);
        const clean = sanitizeText(txt);
        if (clean.trim().length > 1) textBlocks.push({ page: i + 1, text: clean });
        logs.push(`p${i + 1}: ocr applied`);
        ocr_used = true;
      }
      ocr_used = true;
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
    // Su timeout o fetch fallito, restituiamo comunque 200 con fallback minimale per evitare loop lato chiamante
    if (code === "TIMEOUT" || code === "PDF_FETCH_FAILED") {
      return res.json({
        pages: 1,
        ocr_used: false,
        extraction_quality: 0,
        tables: [],
        text_blocks: [
          { page: 1, text: `PDF fetch failed: ${message}. Please verify the URL is accessible and try again.` }
        ],
        logs: [String(message)].slice(0, 1),
      });
    }
    const status = code === "UNSUPPORTED_PDF" ? 413 : code === "TIMEOUT" ? 408 : 400;
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


