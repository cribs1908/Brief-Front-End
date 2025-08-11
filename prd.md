Product Requirements Document – MVP
1. Visione del prodotto
Creare uno strumento estremamente semplice e focalizzato per agenzie di marketing che gestiscono campagne Google Ads, capace di trasformare i dati pubblicitari in una email “client-ready” chiara, sintetica e immediatamente inviabile.
L’obiettivo è ridurre drasticamente il tempo speso nella preparazione di report narrativi e migliorare la comunicazione con i clienti, evitando dashboard complesse e file PDF che vengono spesso ignorati.

2. Problema da risolvere
Le agenzie PPC devono inviare report regolari sulle performance delle campagne ai loro clienti.

Il processo attuale richiede:

Raccolta manuale dei dati da Google Ads.

Analisi e confronto con i periodi precedenti.

Scrittura di un testo chiaro e comprensibile per clienti non tecnici.

Formattazione e invio del report.

Questo processo è ripetitivo, time-consuming e soggetto a errori, e riduce il tempo che il team può dedicare all’ottimizzazione delle campagne.

I tool esistenti offrono dashboard e PDF con grafici, ma non forniscono direttamente un’email narrativa già pronta per il cliente.

3. Soluzione proposta
Un prodotto che, collegandosi a Google Ads e Gmail, genera automaticamente una bozza email strutturata con:

5 Win: miglioramenti o risultati positivi rilevanti.

5 Rischi: criticità, metriche in calo o potenziali problemi.

3 Azioni: raccomandazioni operative chiare e concrete.

La bozza sarà:

Personalizzabile in lingua e tono di voce.

Arricchita con dati concreti (nomi campagne, variazioni % e KPI).

Salvata direttamente in Gmail come bozza pronta all’invio o scaricabile in .eml/.pdf.

4. Feature del primo MVP
4.1 Integrazione Google Ads
Connessione sicura via OAuth con permessi di sola lettura.

Recupero metriche principali (spesa, clic, CTR, conversioni, CPA, ROAS).

Confronto automatico tra periodo attuale e precedente.

Segmentazione per campagna.

Identificazione automatica di campagne top performer e sotto-performanti.

4.2 Generazione narrativa AI
Creazione di testo chiaro e comprensibile per non addetti ai lavori.

Struttura fissa: 5 Win, 5 Rischi, 3 Azioni.

Personalizzazione lingua (es. italiano, inglese).

Personalizzazione tono (formale, amichevole, diretto).

Inserimento di nomi campagne, variazioni percentuali e KPI rilevanti.

4.3 Integrazione Gmail
Connessione sicura via OAuth.

Creazione bozza email con:

Oggetto precompilato.

Corpo email in HTML pronto all’invio.

Firma predefinita dell’agenzia.

Opzione di download in formato .eml o .pdf.

4.4 Automazione e schedulazione
Schedulazione automatica (es. ogni lunedì alle 09:00).

Generazione manuale del report in qualsiasi momento.

Notifica interna quando la bozza è pronta.

4.5 Gestione multi-cliente
Collegamento di più account Google Ads.

Configurazioni personalizzate per ogni cliente (lingua, tono, firma).

Cronologia dei report generati per ciascun cliente.

