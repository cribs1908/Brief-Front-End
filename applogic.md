# AdBrief – Backend Logic Documentation

## 1. Overview
AdBrief è una piattaforma che genera e invia automaticamente report settimanali di performance Google Ads ai clienti delle agenzie di marketing, in formato email già pronto all’invio tramite Gmail.

Il backend ha il compito di:
1. Connettere e sincronizzare le integrazioni esterne (Google Ads API, Gmail API, in futuro Meta Ads API).
2. Gestire la logica di raccolta, elaborazione e sintesi dei dati pubblicitari.
3. Generare il contenuto dell’email seguendo lo schema "5 Win – 5 Rischi – 3 Azioni".
4. Gestire l’automazione della generazione report secondo le schedulazioni definite.
5. Conservare cronologia e stato di ogni report.

---

## 2. Entità principali e relazioni

### 2.1 Utente
- Creato in fase di registrazione (auth già esistente).
- Può avere più **Clienti** associati.
- Può configurare integrazioni globali (Google Ads, Gmail).
- Possiede preferenze di default (lingua, tono, firma).

### 2.2 Cliente
- Appartenente a un singolo utente.
- Ha preferenze proprie (override delle globali).
- Ha mappatura verso uno o più account pubblicitari esterni.
- Ha uno storico di report generati.

### 2.3 Integrazione
- Contiene credenziali/token di accesso ai servizi esterni.
- Deve gestire refresh dei token e validità delle autorizzazioni.
- Collegata a livello di utente o di cliente.

### 2.4 Report
- Generato per un singolo cliente.
- Stato: `bozza` | `inviato` | `errore`.
- Contiene corpo email strutturato e metadati (data, periodo, sorgenti dati).
- Archiviato in cronologia.

### 2.5 Automazione
- Definisce giorno/ora e cliente di destinazione.
- Può essere globale (per tutti i clienti) o specifica per un cliente.

---

## 3. Flussi principali

### 3.1 Collegamento Integrazioni
1. L’utente avvia la connessione a Google Ads → OAuth → salvataggio token.
2. L’utente avvia la connessione a Gmail → OAuth → salvataggio token.
3. Backend memorizza e associa i token all’utente.
4. Se i token scadono, il backend gestisce il refresh automatico.

### 3.2 Aggiunta Cliente
1. L’utente crea un cliente con nome e preferenze.
2. L’utente seleziona l’account Google Ads associato.
3. Backend memorizza mappatura cliente → account Ads.

### 3.3 Generazione Report Manuale
1. L’utente seleziona cliente e periodo.
2. Backend:
   - Recupera dati da Google Ads API per il periodo selezionato.
   - Elabora metriche chiave (CTR, CPC, conversioni, spesa, ROAS).
   - Identifica **5 performance positive (Win)** e **5 criticità (Rischi)**.
   - Suggerisce **3 azioni** da intraprendere.
3. Backend costruisce corpo email con:
   - Introduzione personalizzata.
   - Sezioni Win, Rischi, Azioni.
   - Firma configurata.
4. Backend salva il report in stato `bozza`.
5. L’utente può:
   - Aprire bozza in Gmail.
   - Scaricare `.eml` o `.pdf`.
   - Rigenerare con altri parametri.

### 3.4 Automazione Report
1. L’utente imposta automazione (giorno/ora) a livello globale o cliente.
2. Scheduler backend esegue alla data/ora configurata:
   - Recupera dati.
   - Genera email.
   - Salva in bozza o invia direttamente (se configurato).
3. Notifica all’utente al termine generazione.

### 3.5 Cronologia e Stato
- Ogni report generato viene salvato con:
  - Cliente.
  - Periodo.
  - Data generazione.
  - Stato (`bozza`, `inviato`, `errore`).
- L’utente può filtrare e aprire report passati.

---

## 4. Logiche interne di elaborazione

### 4.1 Estrazione dati
- Per ogni campagna attiva, recuperare metriche aggregate.
- Calcolare variazioni rispetto al periodo precedente.
- Classificare metriche in positivo/negativo rispetto a benchmark.

### 4.2 Sintesi con AI
- Passare dati strutturati a un modello AI.
- Prompting per:
  - Evidenziare 5 risultati migliori.
  - Evidenziare 5 rischi.
  - Proporre 3 azioni.
  - Usare tono e lingua configurati.
- Output strutturato in HTML e plain text.

### 4.3 Generazione Email
- Assemblare sezioni in un unico template email.
- Inserire firma.
- Adattare HTML a Gmail-friendly layout.
- Salvare come bozza in Gmail tramite API.

---

## 5. Gestione errori e fallback
- Se token scaduto → tentare refresh, se fallisce notificare utente.
- Se API Google Ads non risponde → ritentare entro 5 min fino a 3 volte.
- Se generazione AI fallisce → inviare email “bozza non generata” con link rigenera.
- Log di ogni errore associato a report/automazione.

---

## 6. Sicurezza e Privacy
- Token OAuth criptati nel database.
- Dati dei clienti e report non accessibili ad altri utenti.
- Log accesso API senza dati sensibili in chiaro.

