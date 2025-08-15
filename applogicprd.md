# PRD — SpecSheet Comparator (domain‑agnostic)

**Owner:** Leonardo / Team

**Purpose:** Abilitare buyer B2B e team tecnici a confrontare rapidamente prodotti/servizi caricando 2–3 o più PDF (datasheet/spec sheet/whitepaper), estraendo campi chiave e generando una tabella comparativa normalizzata, con provenienza e confidenza. La piattaforma è *domain‑agnostic* tramite profili di dominio e una *synonym map* auto‑arricchente.

**Hosting & Platform Services (nomi, non stack):**

* Hosting: Vercel
* DB/State: Convex
* OCR: Google Cloud (Vision/Document AI)
* Tabelle da PDF: Tabula
* Orchestrazione semantica: LangChain
* Auth: Clerk
* Pagamenti: Polar

---

## 1) Obiettivi & risultati attesi

### Obiettivi

1. Ridurre il tempo di confronto di 3 spec sheet da ore a minuti.
2. Output affidabile: valori con unità normalizzate, confidenza e link alla fonte nel PDF (pagina + bbox).
3. Piattaforma estendibile: aggiunta di nuovi domini tramite profili dichiarativi senza cambiare la pipeline.
4. Asset di conoscenza: *synonym map* condivisa che si arricchisce automaticamente con ogni upload e migliora recall.

### KPI (SLO)

* **Accuratezza quantitativi (±5%)**: ≥ 92% su tabelle, ≥ 85% su testo.
* **Copertura campi core per dominio**: ≥ 90%.
* **Latenza E2E (3 PDF, 20 pagine)**: p95 ≤ 45s, p99 ≤ 90s.
* **Job conclusi senza intervento**: ≥ 98% (rolling 7d).
* **Confidenza media dei campi mostrati**: ≥ 0.80; <0.60 marcati “Review”.

---

## 2) Utenti & casi d’uso

* **Buyer tecnici / Procurement**: confronti rapidi per acquisti.
* **Ingegneri / System architects**: scelta componenti (chip, networking, storage, energia, robotica…).
* **PM/CTO per API/SaaS**: confronti di performance, limiti, sicurezza, compliance.
* **System integrators/consulenti**: preparazione di matrice comparativa e report condivisibili.

**Casi d’uso principali**

1. Carico 3 PDF di prodotti simili → ottengo tabella comparativa pronta per export.
2. Vedo differenze chiave evidenziate (best/worst per colonna).
3. Clic su una cella → apro il PDF alla sezione precisa da cui proviene il valore.
4. Campo ambiguo → lo correggo manualmente (override) e riesporto.
5. Salvo il confronto come progetto e lo condivido internamente.

---

## 3) Ambito (in / out)

**In scope**

* Upload fino a 5 PDF per job, 200 pagine max ciascuno.
* Supporto domini multipli tramite profili (chip, networking, storage, energia, industriale, security, SaaS, API).
* Estrazione ibrida (Tabula + OCR + testo), normalizzazione unità, gestione range, provenienza e confidenza.
* *Synonym map* globale arricchente + personalizzazioni per tenant.
* Export CSV/XLSX/JSON; report PDF leggero (opzionale v2).
* Ruoli base: Viewer, Editor, Admin (per workspace).

**Out of scope (v1)**

* Parsing di grafici/curve avanzate.
* Traduzione completa multilingua del contenuto (solo sinonimi multilingua per matching).
* Annotazioni collaborative in tempo reale (commenti v2).

---

## 4) Esperienza utente (flusso alto livello)

1. **Onboarding**: signup con Clerk, creazione workspace (free trial o piano a pagamento con Polar).
2. **Nuovo confronto**: crea job → riceve URL di upload → carica 2–3 PDF.
3. **Elaborazione**: barra stato in tempo reale (SSE/WebSocket) con step: *UPLOADED → CLASSIFYING → PARSING → EXTRACTING → NORMALIZING → BUILDING TABLE → READY* (+ *NEEDS\_REVIEW*, *PARTIAL*).
4. **Risultato**: tabella con colonne dettate dal profilo di dominio; badge confidenza; pillole best/worst. Clic cella → anteprima PDF alla bbox.
5. **Revisione**: celle gialle sotto soglia; possibilità di override; log audit.
6. **Export & share**: scarica CSV/XLSX/JSON; salva confronto; duplica.

---

## 5) Architettura concettuale

### 5.1 Moduli principali

* **Orchestratore job** (backend): gestisce stati, code, retry, backpressure; scrive/legge Convex.
* **Ingestion**: validazioni PDF, hashing, salvataggio metadati e storage; generazione URL upload firmati.
* **Classifier dominio**: heuristics + embeddings; può chiedere conferma all’utente.
* **Parser**:

  * *Detector* testo vs immagine;
  * *Tabula* per tabelle vettoriali;
  * *Google Cloud OCR* per pagine scansionate (testo + bbox, strutture tabellari baseline);
  * estrattore testo per sezioni (header/body).
* **Extractor semantico (LangChain)**: applica profilo, risolve sinonimi, disambigua range, assegna confidenza e provenienza.
* **Normalizer**: converte unità, canonizza enum/list, calcola valori derivati (es. W da mA\@V), applica bounds.
* **Comparison Builder**: costruisce la tabella finale (colonne, righe, highlights, score opzionale) e produce artefatti di export.
* **Synonym Service**: apprendimento e governance della *synonym map* (globale + per-tenant).
* **Admin & Telemetry**: metriche, audit, profili versionati, gestione errori.

### 5.2 Flusso dei dati (concettuale)

1. Frontend crea job → Convex `jobs` (stato `CREATED`).
2. Upload PDF → `documents` + storage; stato `UPLOADED`.
3. Classificazione dominio → salva `domain_candidate` su `documents` e `jobs`.
4. Parsing per pagina → `artifacts` (testo, tabelle, bbox, quality score).
5. Estrazione con LangChain + profilo → `extractions_raw` (valore grezzo + provenienza + confidenza).
6. Normalizzazione → `extractions_norm` (unità target, note/calcoli, flags).
7. Build tabella → `results` (columns, rows, highlights, export pointers).
8. Stato `READY` + notifica frontend.

---

## 6) Modello dati (Convex — concettuale)

* **workspaces** `{ id, name, plan, owner_id, created_at }`
* **users** `{ id, email, clerk_id, name }`
* **memberships** `{ workspace_id, user_id, role }`
* **jobs** `{ id, workspace_id, status, domain_mode: "auto|forced", domain: "chip|api|saas|networking|...", profile_version, created_at, metrics:{latency_ms, pages_total, ocr_pages, cost_estimate}, error }`
* **documents** `{ id, job_id, filename, hash, pages, storage_url, mime, quality_score }`
* **artifacts** `{ id, document_id, page, type:"text|table|ocr|layout", payload, bbox_map, created_at }`
* **extractions\_raw** `{ id, document_id, field_id, field_label, value_raw, unit_raw, source:{page,bbox,method}, confidence, candidates:[...], created_at }`
* **extractions\_norm** `{ id, document_id, field_id, value, unit, note, flags:["needs_review"|"out_of_bounds"|...], provenance_ref, confidence }`
* **results** `{ id, job_id, columns:[{id,label,unit,better:"up|down|n/a"}], rows:[{document_id, cells:{field_id: {value, unit, confidence, provenance_ref, flags}}}], highlights:[...], exports:{csv_url,xlsx_url,json_url} }`
* **profiles** `{ id, domain, version, schema, synonyms, units, rules:{ranges, priorities, bounds, canonical_maps}, created_at }`
* **synonyms\_global** `{ id, token, variants:[...], domain_context, score }`
* **synonyms\_workspace** `{ id, workspace_id, token, variants:[...], domain_context, source:"curated|auto", score }`
* **overrides** `{ id, result_id, document_id, field_id, value, unit, user_id, created_at }`
* **audit\_logs** `{ id, actor, action, target, metadata, created_at }`
* **billing** (via Polar webhooks) `{ workspace_id, plan, status, period, seats }`

---

## 7) Profili di dominio (dichiarativi)

Ogni profilo definisce:

* **Campi**: id, label, tipo (`quantity|range|enum|list|boolean|text|matrix`), unità target, *direction of better*, required/optional.
* **Sinonimi**: termini/varianti multilingua per ogni campo.
* **Priorità di fonte**: ordine di ricerca (tabelle specifiche → header → corpo), pattern per titoli di sezione (es. “Electrical Characteristics”, “Pricing”, “SLA”).
* **Regole range**: gestione `min|typ|max`, valore preferito per confronto.
* **Canonizzazioni**: mappe enum/list (es. I2C→I²C, OAuth2→OAuth 2.0).
* **Bounds**: validazioni di plausibilità (min/max ragionevoli) per flaggare outlier.

**Domini iniziali v1 (12 campi core suggeriti ciascuno):** chip, networking, storage, energia, industriale/robotica, sicurezza (SIEM/EDR), SaaS, API.

---

## 8) Synonym Map — apprendimento continuo

### Obiettivo

Costruire un asset unico che migliori col tempo il recall/precision nella mappatura campo↔terminologia dei PDF.

### Fonti di segnale

1. **Match riusciti**: quando un termine porta a un’estrazione valida (alta confidenza), incrementa il punteggio di associazione term→field.
2. **Override utente**: se l’utente corregge un campo, registra coppie *termine vicino → field corretto*.
3. **Missing ricorrenti**: analizza dove il sistema non trova un campo ma un termine simile ricorre; propone nuovi sinonimi a bassa confidenza.

### Pipeline logica

* **Raccolta**: da `artifacts` (header/tabelle) estrai header/etichette candidate e tokenizza.
* **Associazione**: per ogni `field_id` del profilo, calcola similarità tra label candidata e sinonimi conosciuti; se confidenza > soglia, registra *co‑occurrence*.
* **Aggiornamento**:

  * **workspace**: aggiungi a `synonyms_workspace` con `source:"auto"` e `score` iniziale; usa subito per job futuri del workspace.
  * **globale**: se lo stesso mapping supera soglia di stabilità su N job e >K workspace, promuovi in `synonyms_global` (curazione automatica), con versioning.
* **Governance**: Admin può *promuovere/declassare* in UI e bloccare sinonimi errati (blacklist per dominio).
* **Versioning**: ogni job salva `synonym_snapshot_version` per riproducibilità.

### Sicurezza & privacy

* Non salvare contenuto sensibile; solo **etichette/termini** e statistiche di co‑occorrenza.
* Opt‑out per workspace che non vogliono contribuire alla mappa globale.

---

## 9) Normalizzazione & fiducia

* **Quantità**: conversione a unità target; conservare valore/unità originali + *note* (es. “calcolato da 44 mA @ 3.3V”).
* **Range**: memorizzare `min|typ|max` + condizioni (es. “@25°C”); scegliere `typ` per confronto salvo regola diversa.
* **Enum/List**: applicare canonical mapping del profilo.
* **Confidenza**: funzione che combina (match sinonimi, struttura tabella, qualità OCR, coerenza unità, distanza semantica). Soglie: `>=0.8 OK`, `0.6–0.79 Review`, `<0.6 Hidden by default`.
* **Provenienza**: obbligatoria per ogni cella (`document_id, page, bbox, method`). Abilita *click‑to‑source*.

---

## 10) Stato, errori, resilienza

**State machine job**

* `CREATED → UPLOADED → CLASSIFIED → PARSED → EXTRACTED → NORMALIZED → BUILT → READY`
* Terminali: `FAILED`, `PARTIAL`, `CANCELLED`.

**Error taxonomy**

* `PARSE_TABLE_FAIL`, `OCR_REQUIRED`, `DOC_QUALITY_LOW`, `AMBIGUOUS_RANGE`, `UNIT_CONFLICT`, `PROFILE_MISSING_FIELD`, `SERVICE_RATE_LIMIT`, `TIMEOUT`.

**Retry & backpressure**

* Retry con backoff esponenziale per step esterni (OCR); limiti per LLM.
* Coda con priorità; rifiuto gentile con messaggio se oltre soglia di carico.

**Idempotenza**

* Chiave (job\_id, pdf\_hash, profile\_version, synonym\_version) per riuso artifacts.

---

## 11) Sicurezza, privacy, compliance

* Upload con URL firmati;
* Crittografia at‑rest e in‑transit;
* Isolamento per workspace (multi‑tenant);
* Data retention configurabile: cancellazione PDF dopo N giorni, mantenendo solo artefatti minimi.
* Audit log per ogni override/modifica;
* DLP base per evitare indicizzazione di PII.

---

## 12) Billing & piani (Polar)

**Free Trial**

* 5 job totali, max 3 PDF/job, 50 pagine/PDF, export CSV.

**Pro (\$49/m)**

* Confronti illimitati ragionevoli (fair use), 5 PDF/job, 200 pagine/PDF, export CSV/XLSX/JSON, *synonym map* workspace, priorità in coda, report PDF base.

**Enterprise (custom)**

* *On‑prem/region‑bound processing*, SLA + SSO, *synonym map* privata e seed dei profili, limiti estesi, supporto dedicato.

Gestione con webhooks: all’upgrade/downgrade aggiorna `workspaces.plan` e quote.

---

## 13) Telemetria & qualità

* Metriche per step: latenza p50/p95/p99; % OCR usato; % fallback Tabula→OCR; error rate per taxonomy; coverage per campo.
* Dashboard con trend e costi stimati (per pagina OCR/LLM).
* Allarmi: spike errori, confidenza media < soglia, code saturate.

---

## 14) QA & dataset

* **Corpus**: 250 PDF reali su 8 domini (tabelle/testo/scansione mix).
* **Gold set**: 25 PDF annotati manualmente (12–15 campi per dominio).
* **Regressioni**: ogni release profilo/synonym aggiorna KPI vs baseline; rollback se degrado.

---

## 15) UI/UX — requisiti funzionali (senza stack)

* Stato in tempo reale per job (SSE/WebSocket).
* Tabella adattiva al profilo: colonne con label, unità target, *direction of better*.
* Celle con badge (OK/Review/Missing) e tooltip con valore grezzo, unità orig., provenienza, nota calcolo.
* Click‑to‑source: apertura PDF alla bbox evidenziata.
* Filtri/ordinamenti e *diff highlights* automatici.
* Override manuale con audit.
* Export coerenti alla vista.
* Drawer “Dati calcolati” per spiegare conversioni.
* Centro notifica errori comprensibile (taxonomy friendly).

---

---

## 17) Criteri di accettazione

* Ogni cella della tabella ha `value`, `unit`, `confidence`, `provenance_ref` cliccabile, `flags`.
* Per 3 PDF/20p: risultato `READY` entro 45s p95.
* Profili versionati e memorizzati per job; synonym snapshot applicato.
* Export coerenti con la vista; includono metadati (profilo, versione, timestamp, confidenze).
* Errori classificati correttamente; job *PARTIAL* sempre consegnano output utile.

---

## 18) Rischi & mitigazioni

* **Variabilità PDF estrema** → fallback OCR + ricostruzione euristica tabelle; *page targeting*.
* **Costi OCR/LLM** → caching per hash, batching, limiti per piano.
* **Cold start sinonimi** → seed iniziale per dominio; raccolta da job reali; opt‑in per training globale.
* **Fiducia utente** → provenienza obbligatoria, UI chiara “Review”, override auditabile.

---

## 19) Allegati operativi

* **Lista campi core per dominio (bozze)**

  * *Chip*: Model, CPU Arch, Max Freq, Power typ/max, Package, Interfaces, Flash/RAM, Temp range, Peripherals, Supply voltage, Certifications, Price notes.
  * *API*: Base URL, Auth, Rate limit, Latency p95, SLA, Regions, SDKs, Webhooks, Data residency, Compliance, Pricing basis, Quotas/burst.
  * *SaaS*: Core features, Integrations, SLA, Uptime last 12m, Security (SOC2/ISO), SSO/SCIM, Data retention, Pricing tiers, Usage caps, Support SLO, Regions, Backups.
  * *Networking*: Ports/speed, Switching capacity, Throughput, L3 features, PoE budget, Latency, Redundancy, Temp, Power, Certs, MTBF, Warranty.
  * *Storage*: Capacity, IOPS, Throughput, Latency, RAID/erasure, Endurance/TBW, Interfaces, Cache, Power idle/active, Form factor, Encryption, Warranty.
  * *Energia*: Potenza nominale, Efficienza, Tensione/Corrente, Temp rango, IP rating, Certificazioni, Garanzia, Dimensioni/peso, Inverter compat., Comunicazioni, MTBF, Sicurezze.

---

**Nota finale:** questo PRD è deliberatamente *domain‑agnostic* e “production‑ready oriented”. La combinazione Convex + Google Cloud OCR + Tabula + LangChain fornisce robustezza, auditabilità e miglioramento continuo tramite la *synonym map*. L’hosting su Vercel, i pagamenti via Polar e l’autenticazione con Clerk completano l’ossatura operativa per un lancio commerciale.
