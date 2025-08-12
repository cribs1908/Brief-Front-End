Ottimizzare il flusso “3 PDF in → tabella comparativa out” nel minor numero di azioni possibili.

Mantenere layout con sidebar sinistra e contenuto principale a destra.

Implementare solo la logica di interfaccia e interazioni (nessuna integrazione reale): dati e azioni possono essere simulati.

Navigazione e sezioni

Voci in sidebar: Overview, Nuovo Confronto, Archivio, Statistiche, Impostazioni.

Il passaggio tra sezioni non deve perdere lo stato locale del confronto in corso.

Overview (Dashboard)

Mostrare un blocco introduttivo con invito al caricamento rapido.

Inserire un’area di trascinamento immediato per 2–3 PDF: al rilascio, aprire “Nuovo Confronto” già popolato con i file.

Elenco “Confronti recenti” (max 5): nome, data, numero di PDF, azione apri.

Indicatore informativo “Mappa sinonimi” (conteggio o stato fittizio) per comunicare che il sistema migliora con gli upload.

Nuovo Confronto (Upload + Anteprima nella stessa pagina)

Area di caricamento principale con supporto caricamento multiplo; suggerire come ottimale 3 PDF ma permettere 2–5.

Lista file caricati: nome, dimensione, stato, rimozione singola.

Azione “Avvia confronto”: mostrare progress a step (Estrazione → Normalizzazione → Generazione tabella) con avanzamento simulato.

Al completamento, non cambiare pagina: visualizzare tabella comparativa nella stessa vista, sopra o sotto la lista file.

Consentire aggiunta/rimozione di PDF anche dopo la generazione: la tabella si rigenera mantenendo i filtri selezionati.

Barra azioni della tabella: Esporta CSV, Copia in Keynote (placeholder: generare documento semplice), Salva in Archivio (simulato).

Tabella comparativa (comportamenti)

Struttura: colonne = documenti/fornitori; righe = specifiche/metriche normalizzate.

Ordinamento per colonna con stato visivo dell’ordinamento.

Evidenziazione del valore migliore per riga in base a regole base:

Valori numerici: maggiore = migliore (consentire inversione per metriche dove minore è migliore).

Valori booleani: vero prevale su falso.

Testuali: mostrare badge o icone standardizzate (es. “SLA 99.9%”).

Pannello filtri laterale: attivazione/disattivazione di categorie di metriche; ricerca per nome metrica; reset filtri.

Meccanismo di paginazione o virtualizzazione per dataset ampi (concettuale: evitare degrado prestazionale).

Stato “nessun dato” chiaro se una metrica non è presente in un documento.

Archivio

Elenco confronti salvati con ricerca e filtri (per data, numero PDF, tag).

Ogni riga mostra: nome, data, numero di PDF, azioni Apri / Duplica / Elimina (simulate).

Mini-anteprima della tabella (immagine o canvas generato) per riconoscimento visivo rapido.

Apertura di un confronto porta a una vista dettaglio che riusa la stessa tabella comparativa con dati caricati.

Statistiche (insight aggregati)

Due blocchi:
a) elenco di metriche più ricorrenti con percentuali (fittizie), ordinabili;
b) un grafico semplice (anche statico) che riassume pattern esemplificativi (es. diffusione di un tipo di pricing).

Azione “Esporta CSV” per ogni blocco (simulata).

Nota esplicita che i dati sono placeholder finché non verrà connesso il backend.

Impostazioni

Sezione “Unità di misura”: selezione preferenze per categorie (es. throughput, storage, latenza).

Sezione “Mappa sinonimi”: piccola tabella editabile “termine → canonico”, con possibilità di aggiungere/rimuovere righe, e validazione base (no duplicati canonici).

Persistenza locale temporanea (concettuale) per la demo.

Stati e feedback

Messaggi di avanzamento durante il parsing simulato.

Notifiche/feedback per azioni di export, salvataggio, duplicazione, eliminazione (simulate).

Gestione errori base: file non valido, limite massimo, annullamento job fittizio.

Accessibilità e usabilità

Navigazione completa da tastiera, focus evidente, etichette per i controlli.

Header di tabella semanticamente corretti; testo alternativo per anteprime.

Evitare interazioni che richiedano precisione millimetrica (target di click adeguati).

Criteri di accettazione complessivi

Da Overview è possibile trascinare 3 PDF e vedere una tabella comparativa con ordinamento e filtri senza cambiare pagina oltre Nuovo Confronto.

Toolbar della tabella offre Export CSV, Copy to Keynote e Salva in Archivio (tutte funzionano come simulazioni).

Archivio mostra confronti con ricerca, azioni simulate e mini-anteprima.

Statistiche presentano almeno un elenco ordinabile e un grafico di esempio con export simulato.

Impostazioni consentono di modificare unità e sinonimi a livello di UI, con persistenza locale di demo.

Nessun riferimento a librerie/stack; implementazione focalizzata su comportamento, stati e flusso utente.