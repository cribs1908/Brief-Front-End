“MOCK DATA FLOW” PER TESTARE IL FRONTEND
Obiettivo

Quando l’utente carica 1–3 PDF qualsiasi, il sistema genera subito una tabella comparativa con dati simulati, così possiamo validare UX, ordinamenti, filtri ed export, senza backend.

Il flusso deve trasmettere l’esperienza finale: “carico 3 competitor → vedo una tabella pronta per decidere”.

1) Comportamento generale
Trigger: caricamento di 1–5 PDF (suggerito 3).

Esito: creazione di un “Confronto” in memoria e render della Comparison Table nella pagina Nuovo Confronto.

Persistenza temporanea: mantenere l’ultimo Confronto anche cambiando tab (stato locale o storage temporaneo).

Azioni disponibili nella toolbar della tabella (simulate):

Esporta CSV (file generato dai mock).

“Copia in Keynote” (genera documento semplificato a due colonne con footer brand).

Salva in Archivio (aggiunge il confronto alla lista mock dell’Archivio).

2) Modello dati (mock) — campi e regole
Per ogni documento caricato:

vendor (derivato dal nome file, es. “launchdarkly.pdf” → “LaunchDarkly”; normalizzare in Title Case).

docId (UUID simulato).

dateParsed (timestamp).

source (nome file originale).

Metriche per la tabella (righe). Inserire 20–25 righe miste, coerenti con “feature flags / piani SaaS”, includendo tipi diversi per testare rendering:

Valori numerici (maggiore = migliore)

Throughput (req/s)

Concurrent Flags

SDKs Supported (count)

Max Environments

Evaluations/ms

Data Retention (days)

Uptime SLA (%)

Monthly Price ($) → per questa riga definire “minore = migliore”

Seats Included

Support Response (hrs) → minore = migliore

Valori booleani

Audit Logs (true/false)

SAML/SSO

SOC2

GDPR

On-Prem / Self-Host

Valori categoriali / testuali standardizzati

Pricing Model (Usage-Based | Tiered | Flat)

SLA Tier (Standard | Premium | Enterprise)

Flag Types (Boolean | Multivariant | Dynamic — elenco)

Rollout Strategies (Gradual | Targeted | A/B | Rules)

Environments (Dev/Staging/Prod — elenco)

SDK Languages (Java, JS, Python, Go, Swift, etc. — elenco corto 3–6 voci)

Variabilità mock

Generare 3 profili diversi per i vendor: “High-Perf”, “Balanced”, “Budget”.

High-Perf: valori alti su throughput/SDK/SLA; prezzo alto.

Balanced: valori medi; prezzo medio.

Budget: valori bassi; prezzo basso; qualche booleano assente.

Per Pricing Model variare fra Usage-Based, Tiered, Flat (almeno una volta ciascuno).

Per Compliance (SOC2/GDPR) mescolare true/false per verificare evidenziazione “red-flag” futura.

3) Regole di visualizzazione e interazione
Colonne = vendor/documenti, righe = metriche (come sopra).

Ordinamento per colonna:

Numerici: crescente/decrescente; per righe marcate “minore è migliore” invertire la logica di evidenziazione.

Booleani: vero prima di falso.

Categoriali: ordinare alfabeticamente.

Evidenziazione del “miglior valore” per riga:

Numerici: marca la cella col valore vincente (gestire eccezioni “minore è migliore”).

Booleani: vero prevale.

Categoriali: non evidenziare, ma mostrare badge standardizzati.

Filtri laterali:

Toggle per gruppi di metriche (Performance, Pricing, Compliance, Supporto, SDK).

Ricerca per nome metrica.

Reset filtri.

Tooltip sulle celle con liste (SDK, Environments, Flag Types) per mostrare l’elenco completo.

4) Customer Experience (massimizzare la percezione di valore)
Anteprima immediata: dopo upload, mostrare progress a step (Estrazione → Normalizzazione → Generazione), poi la tabella nella stessa pagina; evitare ulteriori click.

Guidance inline: breve messaggio sopra la tabella: “Ordina una colonna per evidenziare il leader; usa i filtri per concentrarti su ciò che conta”.

Call-to-action chiare (toolbar visibile): Esporta CSV, Copy to Keynote, Salva in Archivio.

Scorciatoie di confronto:

Pulsante “Mostra solo differenze” (nasconde righe identiche in tutte le colonne).

Switch “Mostra solo red flags” (per ora mock: evidenzia SOC2/GDPR mancanti, Support Response > 24h, SLA < 99.9%).

Stati vuoti significativi: se manca una metrica in un documento, visualizzare “—” con tooltip “Non presente nel PDF”.

Performance UX: paginare o virtualizzare oltre ~50 righe; mantenere header di tabella sempre visibile.

Coerenza navigazione: tornando a Overview o Archivio, mantenere l’ultimo confronto pronto all’apertura.

5) Archivio e Overview (con mock)
Salvataggio mock: quando l’utente clicca “Salva in Archivio”, creare una voce con: nome confronto (derivato da vendor principali), data, numero di PDF, piccola anteprima (immagine o canvas semplificato).

Archivio: ricerca per nome; azioni “Apri / Duplica / Elimina” simulate.

Overview: area drag-and-drop rapida che porta a Nuovo Confronto già popolato; elenco degli ultimi 3–5 confronti salvati.

6) Acceptance criteria (per questa iterazione)
Caricando 1–5 PDF qualunque, l’utente vede una tabella comparativa realistica con ~20–25 metriche eterogenee.

Ordinamento, filtri, “mostra solo differenze” e “mostra red flags” funzionano sui dati mock.

La toolbar consente di:

esportare un CSV coerente con la tabella visibile,

generare un documento semplice a due colonne per “Copy to Keynote” (placeholder),

salvare il confronto e ritrovarlo in Archivio.

Lo stato del confronto persiste passando tra tab.

Nessun riferimento a implementazione di backend reale; tutto funziona in autonomia per demo UX.

