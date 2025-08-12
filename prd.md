# PRD – PDF Comparison Tool

## 1. Vision
Semplificare e velocizzare il processo di confronto di documenti tecnici PDF per buyer B2B, fornendo una piattaforma intelligente e collaborativa che trasforma documenti complessi in tabelle comparative pronte all’uso.  
Vogliamo eliminare il lavoro manuale di estrazione e normalizzazione delle specifiche, ridurre i tempi di decisione e migliorare la qualità delle analisi, creando al tempo stesso un archivio di conoscenza riutilizzabile.

---

## 2. Obiettivo del Prodotto
Costruire un'applicazione SaaS che consenta di:
- Caricare PDF di competitor (spec sheet, datasheet, piani SaaS, listini API).
- Estrarre automaticamente dati strutturati.
- Normalizzare termini e unità di misura.
- Presentare i dati in una tabella comparativa interattiva.
- Permettere export in diversi formati (CSV, presentazioni).
- Offrire funzionalità avanzate come scansioni di compliance (“red-flag scan”) e insight di mercato aggregati.

---

## 3. Perché lo stiamo sviluppando
### Problema Attuale
- Buyer e team di procurement spendono ore/giorni a leggere documenti complessi e non standardizzati.
- Il processo manuale causa ritardi nelle decisioni e aumenta il rischio di errori.
- Mancano strumenti verticali che trasformino PDF tecnici in comparazioni strutturate.

### Opportunità di Mercato
- Settore B2B in crescita, forte richiesta di strumenti per l’automazione dei processi decisionali.
- Assenza di competitor diretti con la stessa combinazione di estrazione dati + normalizzazione + output pronto per presentazioni.
- Possibilità di iniziare in una nicchia (feature flags SaaS) ed espandere in altri verticali (cloud, hardware, API, cybersecurity).

---

## 4. Funzioni Principali
### Core
1. **Caricamento PDF**
   - Drag-and-drop multiplo.
   - Supporto a file PDF digitali e scannerizzati.
2. **Estrazione Dati**
   - OCR per PDF scannerizzati.
   - Parsing tabelle e testo (Tabula + LangChain).
3. **Normalizzazione**
   - Mappa di sinonimi per uniformare termini tecnici.
   - Conversione automatica unità di misura.
4. **Tabella Comparativa Interattiva**
   - Ordinamento e filtraggio.
   - Evidenziazione automatica valori migliori.
5. **Esportazione**
   - CSV.
   - Presentazioni (Keynote/PowerPoint ready).
   - Salvataggio in archivio interno.

### Avanzate
6. **Red-Flag Scan**
   - Evidenzia mancanze di compliance (SOC2, GDPR, ecc.).
7. **Insight Aggregati**
   - Statistiche anonime ricavate dai confronti globali.
   - API per accesso ai dati.

---

## 5. Target Utente
- Buyer e team di procurement B2B.
- Responsabili IT che valutano fornitori software/hardware.
- Consulenti e analisti di mercato.
- Enterprise con processi di acquisto complessi e multi-vendor.

---

## 6. KPI di Successo
- Riduzione tempo medio per completare un confronto del 70%.
- Adozione del tool in almeno 3 verticali diversi entro 12 mesi.
- Tasso di retention mensile > 80%.
- Crescita base di dati (sinonimi, metriche) con > 10k upload entro il primo anno.

---

## 7. Roadmap Iniziale
**Fase 1 – MVP (3 mesi)**
- Funzioni di caricamento, estrazione, normalizzazione base.
- Tabella comparativa interattiva.
- Export CSV.
- Focus su nicchia "feature flags platforms".

**Fase 2 – Espansione Funzionalità**
- Export presentazioni.
- Archivio e gestione confronti salvati.
- Miglioramento mappa sinonimi con apprendimento continuo.

**Fase 3 – Funzioni Avanzate**
- Red-Flag Scan.
- API dati aggregati.
- Espansione a nuovi verticali.

---

## 8. Differenziazione rispetto a strumenti generici (es. ChatGPT)
- Pipeline specializzata per documenti tecnici PDF.
- Normalizzazione terminologica automatica e continua.
- Output strutturato pronto per decision-making e presentazioni.
- Compliance scan integrata.
- Collaborazione e archiviazione centralizzata dei confronti.

---
