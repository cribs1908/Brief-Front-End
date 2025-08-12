# PDF Comparison Tool – Frontend Structure

## Layout generale
- Struttura a due colonne:
  - **Sidebar sinistra**: fissa, contiene logo, navigazione tramite tab, pulsante di caricamento PDF.
  - **Area contenuto destra**: dinamica, cambia in base alla tab selezionata.

---

## Sidebar
- **Sezione logo** in alto.
- **Navigazione tab** sotto il logo:
  1. **Dashboard** – Panoramica dei confronti recenti.
  2. **Nuovo Confronto** – Pagina di caricamento e configurazione.
  3. **Archivio** – Lista dei confronti salvati.
  4. **Statistiche** – Dati aggregati e insight.
  5. **Impostazioni** – Gestione account e preferenze.
- **Pulsante “Carica PDF”**: posizionato in evidenza nella parte bassa della sidebar, sempre accessibile.

---

## Tab "Dashboard"
- **Intestazione**: titolo e breve riepilogo delle ultime attività.
- **Elenco confronti recenti**:
  - Ogni elemento mostra nome confronto, data creazione, numero di documenti inclusi.
  - Pulsante “Apri” per accedere al dettaglio.
- **Sezione suggerimenti**: link rapidi per creare un nuovo confronto o accedere a template preimpostati.

---

## Tab "Nuovo Confronto"
- **Zona drag-and-drop** centrale per il caricamento PDF.
- **Lista file caricati** sotto l’area di upload:
  - Nome file, dimensione, stato elaborazione.
  - Pulsante rimozione file.
- **Pulsante “Avvia Confronto”** in basso.
- Dopo l’elaborazione, la pagina si trasforma mostrando la **tabella comparativa interattiva**.

---

## Tabella Comparativa
- **Intestazioni di colonna**: nome documento/fornitore.
- **Righe**: ogni riga rappresenta una specifica tecnica o metrica.
- **Celle interattive**:
  - Ordinamento per colonna.
  - Evidenziazione del valore migliore nella riga.
- **Filtri laterali**: permettono di mostrare/nascondere metriche specifiche.
- **Azioni in alto a destra**:
  - Esporta in CSV.
  - “Copia in Keynote” → genera tabella a due colonne pronta per presentazioni.
  - Salva confronto nell’archivio.

---

## Tab "Archivio"
- **Lista confronti salvati**:
  - Nome, data, numero di PDF inclusi.
  - Pulsanti: apri, duplica, elimina.
- **Ricerca e filtro** per trovare rapidamente confronti precedenti.

---

## Tab "Statistiche"
- **Grafici e tabelle** che mostrano:
  - Frequenza di certe specifiche tra i competitor.
  - Percentuale di ricorrenza di metriche.
  - Distribuzione per categorie.
- Possibilità di esportare i dati in formato CSV o accedere alle API.

---

## Tab "Impostazioni"
- Gestione profilo utente.
- Gestione team e ruoli.
- Configurazioni preferenze (unità di misura, sinonimi personalizzati).
- Informazioni sul piano attivo e upgrade.

---
