# Backend – Core Feature Design (OCR → Extraction → Normalization → Comparison Table)
**Scope:** implementare la pipeline server-side che riceve PDF, estrae dati strutturati, li **normalizza** e produce una **tabella comparativa** pronta per il frontend.  
**Tecnologie di riferimento (concettuali):** motore **OCR**, **Tabula** per estrazione tabelle, **LangChain** per parsing/IE (information extraction) e normalizzazione semantica.  
**Fuori scope (ora):** export slide/PPT, insight aggregati, red-flag avanzato, billing, on-prem.

---

## 1) Obiettivi
- Accettare **N PDF** di fornitori e restituire **una matrice metrica × vendor** coerente.
- Garantire **coerenza semantica** con una **Synonym Map** versionata e migliorabile nel tempo.
- Rendere il processo **ripetibile, tracciabile e osservabile** (log, stati, qualità estrazione).
- Minimizzare latenza percepita per consegnare rapidamente la **prima tabella utile**.

---

## 2) Panoramica Architetturale (concettuale)
- **API Ingestion**: riceve job di confronto (lista PDF + meta).
- **Orchestrator**: crea e gestisce gli **Extraction Jobs** (uno per PDF) e il **Comparison Job** (merge).
- **OCR Worker**: trasforma PDF immagine in PDF/testo.
- **Table/Text Extractor (Tabula + parser)**: estrae tabelle e blocchi testo da PDF nativi/digitali.
- **Semantic Parser (LangChain)**: identifica metriche candidate, valori e unità; applica regole.
- **Normalizer**: uniforma terminologia e unità con **Synonym Map** e conversioni.
- **Aggregator**: costruisce il **dataset tabellare** (schema canonico) e calcola delta/derived features.
- **Artifacts Store**: conserva input/output (PDF, JSON per documento, JSON tabella).
- **Metadata Store**: traccia job state, log sintetici, qualità, versioni di mappa sinonimi.
- **Feedback Loop**: riceve correzioni utente e propone aggiornamenti della Synonym Map.

---

## 3) Modello Dati (concettuale)
- **Document**  
  - `document_id`, `job_id`, `vendor_name`, `source_uri`, `ingested_at`, `doc_type`, `pages`, `ocr_used (bool)`
- **Raw Extraction (per documento)**  
  - `tables[]` (celle con coordinate, pagina)  
  - `text_blocks[]` (paragrafi/etichette)  
  - `extraction_quality` (score)
- **Metric Candidates (per documento)**  
  - `metric_key_raw`, `value_raw`, `unit_raw`, `page_ref`, `source_snippet`
- **Normalized Metrics (per documento)**  
  - `metric_id` (canonico), `metric_label`, `value_normalized`, `unit_normalized`, `confidence`, `source_ref`, `normalization_version`
- **Comparison Dataset (per job)**  
  - `vendors[]`, `metrics[]`, `matrix[metric_id][vendor] = {value, unit, confidence, source_ref}`  
  - `deltas[metric_id]` (gap max/min), `best_vendor_by_metric`, `missing_flags[vendor][metric_id]`
- **Synonym Map (versioned)**  
  - `version`, `canonical_metric_id`, `synonyms[]` (pattern), `unit_rules`, `priority`, `last_updated`, `proposed_additions[]`

---

## 4) Flusso End-to-End

### 4.1. Creazione Job
1. Frontend invia `CreateComparisonJob` con lista PDF (+ nomi vendor se noti).  
2. Orchestrator crea record **Comparison Job** con stato `queued`, genera **Extraction Jobs** per ogni PDF con stato `pending`.

### 4.2. OCR & Estrazione
Per ogni **Extraction Job**:
1. **OCR Check**: se PDF non contiene testo affidabile → invia a **OCR Worker** (output: PDF testuale o blocchi immagine+testo).  
2. **Tabula Extract**: estrae tabelle per pagina (con coordinate/celle).  
3. **Text Extract**: estrae headings, bullet, definition lists (pattern di etichetta:valore).  
4. **Quality Scoring**: misura densità di tabelle valide, coerenza righe/colonne, rapporto testo/immagine.  
5. Stato job → `extracted` + salvataggio `Raw Extraction`.

### 4.3. Parsing Semantico (LangChain)
1. Input: `tables[]` + `text_blocks[]`.  
2. Pipeline IE:  
   - **Label Detection**: riconosce etichette di metrica (es. “Throughput”, “req/s”, “Requests per second”).  
   - **Value Capture**: associa valore numerico/booleano/testuale e unità.  
   - **Context Link**: lega valore a pagina/porzione di blob come `source_ref`.  
3. Output: **Metric Candidates** con confidenza e riferimenti.

### 4.4. Normalizzazione (Synonym Map + regole)
1. **Term Mapping**: mappe sinonimi → `metric_id` canonico (es. *req/s*, *throughput*, *requests/sec* → `THROUGHPUT_RPS`).  
2. **Unit Conversion**: conversione unità (es. ms ↔ s, MB ↔ GB), regole di arrotondamento.  
3. **Value Typing**: numerico/booleano/categoriale; validazioni (range plausibili, formati).  
4. **Dedup/Conflict Resolution**: se più valori per stessa metrica:  
   - preferisci tabelle a testo libero;  
   - se parità, prendi quello con confidenza più alta;  
   - conserva **altre versioni** come alternative con motivazione (audit trail).  
5. Output: **Normalized Metrics** per documento. Stato job → `normalized`.

### 4.5. Aggregazione & Generazione Tabella
1. Colleziona tutte le **Normalized Metrics** dei documenti nel job.  
2. **Metric Union**: unione dell’insieme di metriche (righe) su tutti i vendor coinvolti.  
3. **Matrix Fill**: per ogni riga (metrica) e vendor, inserisci `value`, `unit`, `confidence`, `source_ref` o `null` se mancante.  
4. **Derived Computations**:  
   - `best_vendor_by_metric` (max/min secondo regola di dominanza definita dalla metrica);  
   - `deltas` (gap percentuale max/min);  
   - `missing_flags` (metriche critiche assenti).  
5. Stato job → `ready`, salva **Comparison Dataset** come artefatto primario.

---

## 5) Synonym Map – Gestione e Apprendimento

### 5.1. Inizializzazione
- Seed manuale per il primo vertical (es. feature flags): elenco **metriche canoniche** e **sinonimi** comuni (termini, abbreviazioni, pattern regex-like), con **regole unità**.

### 5.2. Applicazione in produzione
- Ogni parsing consulta **Synonym Map (versione attiva)**.  
- La versione è salvata con il job per garantire **reproducibilità**.

### 5.3. Proposte di estensione (feedback loop)
- Quando il parser trova una **label non mappata** con confidenza alta, crea una **Proposed Synonym** legata a una metrica probabile:  
  - dati: label cruda, contesto, vendor, pagina, ipotesi di metrica canonica, confidenza.  
- Un revisore (interno) approva/rifiuta. All’approvazione: nuova `version` della mappa.

### 5.4. Priorità e conflitti
- Ogni sinonimo ha una **priorità**; in caso di match multipli, vince la priorità più alta.  
- Regole dedicate per **ambiguità** (es. “req/s” vs “requests” generico).

---

## 6) Regole di Normalizzazione (principi)
- **Numerici**: conversione unitaria, arrotondamento consistente, notazione decimale unica.  
- **Booleani**: mapping di varianti (“Yes/No”, “Supported/Not Supported”, “Available/—”) a `true/false`.  
- **Categoriali**: vocabolari controllati (es. `Pricing Model ∈ {Usage-Based, Tiered, Flat}`).  
- **Min/Max**: per ogni metrica definire **senso di ottimalità** (es. *prezzo* → min, *throughput* → max).  
- **Quality**: confidenza < soglia → marcare come `low_confidence` per eventuale revisione.

---

## 7) API (contratti concettuali)

### 7.1. Create Comparison Job
- Input: `pdf_list[{uri, vendor_hint?}]`, `job_name?`.  
- Output: `job_id`, `status_url`.

### 7.2. Job Status
- Output: stato globale (`queued|extracting|normalizing|aggregating|ready|failed`), più **per-document state**; summary log per step; progress indicativo.

### 7.3. Get Comparison Dataset
- Output: `vendors[]`, `metrics[]`, `matrix`, `deltas`, `best_vendor_by_metric`, `missing_flags`, `audit_trail_refs`.

### 7.4. Propose Synonym / Approve Synonym
- Input proposta: `label_raw`, `context`, `suggested_metric_id`, `confidence`.  
- Approva: promuove a nuova `Synonym Map version`.

---

## 8) Gestione errori & resilienza
- **Per-document fallback**: se OCR fallisce su un PDF, non bloccare l’intero job; marcare quel vendor come `partial`.  
- **Retry policy**: step OCR/estrazione ripetuti entro soglia; se persiste, log e azione suggerita (“caricare PDF digitale”).  
- **Timeout** per documento; se superato, chiudere job come `ready_partial` con indicatori chiari.  
- **Validation Gate**: rifiuta dataset se **nessuna metrica** utile è stata estratta da tutti i documenti (stato `failed_no_signal`).

---

## 9) Qualità, audit e fiducia
- **Source Traceability**: ogni cella della matrice conserva `source_ref` (pagina, bounding box opzionale, snippet).  
- **Extraction Quality Score** per documento e **Normalization Confidence** per metrica.  
- **Change Log**: il dataset riporta `synonym_map_version` e regole applicate (unità, min/max policy).

---

## 10) Performance & scalabilità (concetti)
- **Parallelismo per documento**: OCR/Tabula/Parsing su worker separati.  
- **Streaming di stato**: aggiornamenti frequenti per il frontend.  
- **Caching**: se lo stesso PDF viene ricaricato (hash), riusa artefatti precedenti compatibili con la stessa versione di Synonym Map.  
- **Batching**: per job con molti PDF, limite di concorrenza e coda controllata.

---

## 11) Sicurezza & multi-tenancy (essenziali)
- Isolamento per **tenant/team** su storage e metadati.  
- **Access control**: solo il team che ha caricato può leggere artefatti e dataset.  
- **Data retention policy**: definire durata di conservazione di PDF e artefatti; possibilità di **hard delete** su richiesta.

---

## 12) Integrazione con il Frontend (contratto UX)
- **Stati step-by-step** esposti per mostrare: *Estrazione*, *Normalizzazione*, *Generazione*.  
- **Partial readiness**: la tabella può essere mostrata appena 2+ documenti sono normalizzati, marcando i restanti come “in arrivo”.  
- **Messaggi guidati**: se mancano metriche chiave o confidenza bassa, inviare note descrittive da esporre nel pannello “log dettagli”.

---

## 13) Roadmap tecnica (solo core feature)
1. **MVP pipeline**: OCR → Tabula → LangChain → Normalizer → Dataset.  
2. **Synonym Map v1**: seed manuale + proposte automatiche.  
3. **Audit trail**: pagina+snippet per cella.  
4. **Partial readiness** + caching per PDF già visti.  
5. **Quality scoring** e soglie operative.

---

## 14) Criteri di accettazione (core)
- Dato un set di 2–5 PDF, il sistema produce **entro un’unica esecuzione**:
  - un **dataset tabellare coerente** con almeno 15–20 metriche normalizzate,  
  - **deltas** e **best-per-metric**,  
  - riferimenti di **fonte** per almeno l’80% delle celle estratte,  
  - **log step** e **stati** per ogni documento,  
  - **Synonym Map version** registrata.  
- Se un PDF è illeggibile, il job resta **utilizzabile** con i documenti rimanenti (stato `ready_partial`).
- Le **proposte di sinonimo** vengono generate quando incontriamo label sconosciute con confidenza ≥ soglia.

---
