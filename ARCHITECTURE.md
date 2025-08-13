# Architettura – Brief PDF Comparison (Stato Attuale)

Questo documento descrive in modo chiaro e completo la struttura dell’applicazione attuale, i componenti deployati (Frontend, Backend, Processor), i flussi end‑to‑end e le integrazioni. È la singola fonte di verità per sviluppatori e DevOps.

## Panoramica
- Obiettivo: trasformare PDF tecnici (scannerizzati o digitali) in una tabella comparativa pronta per la decisione.
- Componenti:
  1) Frontend (Vercel) – UI e orchestrazione client → chiama il backend via HTTP.
  2) Backend (Convex Cloud) – ingestion, orchestrazione pipeline, normalizzazione, dataset comparativo, billing.
  3) Processor (Railway) – microservizio stateless per OCR/estrazione testo+tabelle dai PDF.

## Componenti e responsabilità

### 1) Frontend (Vercel)
- Stack: React Router v7 (SSR), Tailwind v4, shadcn/ui.
- Responsabilità:
  - Schermate: Home/Pricing/Onboarding, Dashboard, “Nuovo Confronto”.
  - In “Nuovo Confronto”:
    - Upload dei PDF (via upload URL generato da Convex Storage).
    - Creazione job (“Avvia Confronto”).
    - Poll dello stato job e fetch del dataset.
    - Rendering della tabella comparativa (ordinamento, filtri, badge red‑flags, esportazioni base).
- Env principali (Vercel):
  - `VITE_CONVEX_URL` → URL pubblico Convex.
  - `VITE_DISABLE_MOCKS=true` → in produzione disattiva ogni mock.
  - (Se attivo Clerk) `VITE_CLERK_PUBLISHABLE_KEY`, `VITE_CLERK_FRONTEND_API_URL`.

### 2) Backend (Convex Cloud)
- Responsabilità core:
  - Endpoint HTTP pubblici per ingestion/poll/dataset/upload‑url.
  - Orchestrazione pipeline per ogni job: estrazione → normalizzazione → aggregazione.
  - Persistenza artefatti e dataset comparativo.
  - Gestione Synonym Map (versionata) e proposte.
  - Integrazione Polar (piani, checkout, webhook) e (facoltativa) Chat/OpenAI.
- Tabelle Convex:
  - `users` (auth), `subscriptions`, `webhookEvents`.
  - Pipeline: `comparisonJobs`, `documents`, `extractionJobs`, `rawExtractions`, `normalizedMetrics`, `comparisonArtifacts`.
  - Sinonimi: `synonymMaps` (versioni attive/storico), `proposedSynonyms`.
- Azioni/Query principali:
  - `pipeline.createComparisonJob` → registra documenti/estrazioni e avvia la pipeline.
  - `pipeline.processExtractionJob` → chiama Processor `/extract`, salva `rawExtractions`, produce `normalizedMetrics`.
  - `pipeline.aggregateJob` → unione metriche, calcolo `best_vendor_by_metric`, `deltas`, `missing_flags`; salva il dataset.
  - `pipeline.getJobStatus`, `pipeline.getComparisonDataset`.
  - `pipeline.seedSynonymMapV1`, `pipeline.proposeSynonym`, `pipeline.approveSynonym`.
- Endpoint HTTP (CORS abilitato verso `FRONTEND_URL`):
  - `GET  /api/upload-url` → genera upload URL per Convex Storage (NOTA: non usare `/api/storage/*`).
  - `POST /api/jobs/create`
  - `GET  /api/jobs/status?jobId=...`
  - `GET  /api/jobs/dataset?jobId=...`
  - `POST /payments/webhook` (Polar)
  - `POST /api/chat` (facoltativo)
- Env (Convex):
  - `FRONTEND_URL` → origine Frontend per CORS e redirect Polar.
  - `PROCESSOR_SERVICE_URL` → URL Processor Railway.
  - `POLAR_SERVER`, `POLAR_ACCESS_TOKEN`, `POLAR_ORGANIZATION_ID`, `POLAR_WEBHOOK_SECRET`.
  - (fac.) `OPENAI_API_KEY`; `VITE_CLERK_FRONTEND_API_URL` se usi Clerk server‑side.

### 3) Processor (Railway)
- Stack: Node 20, Express; sistemi esterni: `tesseract-ocr`, `poppler-utils` (pdftoppm), Java + `tabula.jar`.
- Endpoint:
  - `POST /extract` – Input `{ pdf_url, hints? }`, Output `{ pages, ocr_used, extraction_quality, tables[], text_blocks[], logs[] }`.
  - `GET /health` – sonde.
  - `GET /version` – versioni runtime.
- Pipeline interna:
  - PDF digitali: `pdfjs-dist (legacy)` → text content per pagina → `text_blocks`.
  - PDF scannerizzati/forzati: `pdftoppm` → PNG → Tesseract → `text_blocks`.
  - Tabelle: `tabula-java` (jar con deps) → `tables` per pagina (righe/celle pulite, bbox opzionale).
- Errori strutturati (mai 500 non gestiti): `PDF_FETCH_FAILED`, `UNSUPPORTED_PDF`, `TIMEOUT`, `OCR_FAILED`, `TABLE_EXTRACTION_FAILED`, `INTERNAL_ERROR`.
- Env (Railway):
  - `PORT=8787`, `ALLOWED_ORIGIN=<Convex URL>`, `TABULA_JAR_PATH=/app/tabula.jar`.
  - (fac.) `MAX_PDF_BYTES`, `REQ_TIMEOUT_MS`, `PROC_TIMEOUT_MS`, `ALLOW_HTTP`.

## Flusso End‑to‑End (dettaglio)
1) UI richiede `GET /api/upload-url` (Convex) → riceve un upload URL firmato.
2) UI POSTa il PDF all’upload URL → ottiene `storageId`.
3) UI `POST /api/jobs/create` con `[{storageId, vendor_hint}]` (o `uri` assoluti).
4) Convex crea `comparisonJob` + `documents` + `extractionJobs` e pianifica la pipeline.
5) Per ogni documento: `processExtractionJob` → chiama Processor `/extract` con `{ pdf_url }` → salva `rawExtractions`.
6) Parsing/normalizzazione (Synonym Map v1) → `normalizedMetrics`.
7) `aggregateJob` → dataset comparativo in `comparisonArtifacts`.
8) UI polla `GET /api/jobs/status` fino a `ready|ready_partial`, poi `GET /api/jobs/dataset` e renderizza.

## Dataset Comparativo (forma)
```json
{
  "vendors": [{"id":"...","name":"Vendor A"}, {"id":"...","name":"Vendor B"}],
  "metrics": [{"metric_id":"LATENCY_MS","label":"Latency (ms)","optimality":"min"}, ...],
  "matrix": { "LATENCY_MS": {"<docIdA>": {"value_normalized":12,"unit_normalized":"ms"}, "<docIdB>": null } },
  "deltas": {"LATENCY_MS": 0.3},
  "best_vendor_by_metric": {"LATENCY_MS":"<docIdA>"},
  "missing_flags": {"<docIdA>": {"THROUGHPUT_RPS": false}},
  "synonym_map_version": "v1-..."
}
```

## CORS e sicurezza
- Convex imposta `Access-Control-Allow-Origin` = `FRONTEND_URL` per tutte le route API.
- NON usare path `/api/storage/*` per API custom (riservato al file serving Convex).
- Processor abilita CORS per l’origine Convex (`ALLOWED_ORIGIN`).
- Validazione URL Processor: solo https (o http se `ALLOW_HTTP=true`), blocco loopback.

## Variabili d’ambiente (riassunto operativo)
- Vercel: `VITE_CONVEX_URL`, `VITE_DISABLE_MOCKS`, (Clerk) `VITE_CLERK_*`.
- Convex: `FRONTEND_URL`, `PROCESSOR_SERVICE_URL`, `POLAR_*`, (fac.) `OPENAI_API_KEY`, `VITE_CLERK_FRONTEND_API_URL`.
- Railway: `PORT`, `ALLOWED_ORIGIN`, `TABULA_JAR_PATH`, (fac.) `MAX_PDF_BYTES`, `REQ_TIMEOUT_MS`, `PROC_TIMEOUT_MS`, `ALLOW_HTTP`.

## Deploy
- Frontend: Vercel (preset `@vercel/react-router`).
- Backend: Convex Cloud (Environment Variables + deploy).
- Processor: Railway (Dockerfile: installa tesseract, poppler, java; build TS; `CMD node dist/server.js`; scarica `tabula.jar`).

## Debug & Test
- Processor: `/health`, `/version`, `POST /extract` con PDF pubblico.
- Convex: `POST /api/jobs/create`, `GET /api/jobs/status`, `GET /api/jobs/dataset`.
- UI (Network): sequenza upload-url → upload → create → status → dataset.

## Roadmap (estratto)
- Parser semantico avanzato (LangChain) con `source_ref` più ricco (bbox, snippet esatti).
- UI tooltip con `confidence`, `synonym_map_version` e link pagina PDF.
- Miglioramenti Synonym Map (review/approve in UI, version bump e rollback).
- Caching artefatti per PDF già visti (per versioni Synonym Map compatibili).
