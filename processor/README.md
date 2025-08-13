# Processor Service

Micro-servizio che espone `POST /extract` per estrarre `tables`, `text_blocks` e `pages` da un PDF remoto. Usa:
- pdf-parse per testo digitale
- Tesseract per OCR (fallback o forzato)
- Tabula (tabula-java) per estrazione tabelle

## Requisiti di sistema
- Node 20+
- Java 11+ (per Tabula)
- `tesseract` installato nel PATH
- `tabula.jar` disponibile (imposta `TABULA_JAR_PATH` o mettilo nel working dir)

## Config
- `PORT` (default 8787)
- `ALLOWED_ORIGIN` (CORS, default `*`)
- `MAX_PDF_BYTES` (default 25MB)
- `REQ_TIMEOUT_MS` (default 120000)
- `TABULA_JAR_PATH` (path al jar di tabula)

## Avvio locale
```bash
cd processor
npm i
npm run dev
# GET http://localhost:8787/health
```

## API
### POST /extract
Request
```json
{
  "pdf_url": "https://.../file.pdf",
  "hints": {
    "is_scanned": false,
    "expected_language": "eng",
    "max_pages": 10
  }
}
```
Response
```json
{
  "pages": 4,
  "ocr_used": false,
  "extraction_quality": 0.85,
  "tables": [{"page":1,"rows":[["h1","h2"],["v1","v2"]]}],
  "text_blocks": [{"page":1,"text":"..."}],
  "logs": ["p1: text native","p2: ocr applied","p3: 2 tables found"]
}
```

Errori
```json
{"code":"PDF_FETCH_FAILED","message":"HTTP 404"}
```
Codici: `PDF_FETCH_FAILED`, `UNSUPPORTED_PDF`, `OCR_FAILED`, `TABLE_EXTRACTION_FAILED`, `TIMEOUT`, `INTERNAL_ERROR`.

## Container
Esempio Dockerfile semplificato:
```Dockerfile
FROM node:20-bullseye
RUN apt-get update && apt-get install -y tesseract-ocr && rm -rf /var/lib/apt/lists/*
# Copia tabula.jar nella image o monta a runtime
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ENV PORT=8787
CMD ["npm","run","dev"]
```

## Integrazione con Convex
Imposta `PROCESSOR_SERVICE_URL` nell’ambiente Convex/Server (es. `http://processor:8787`). La pipeline userà `POST /extract` e registrerà l’output come Raw Extraction.


