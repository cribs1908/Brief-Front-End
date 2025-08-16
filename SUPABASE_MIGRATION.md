# Migrazione da Convex a Supabase

## Problema Risolto

L'applicazione si bloccava durante il processo di upload e processing con Convex. Per risolvere rapidamente il problema, abbiamo implementato un'alternativa con Supabase che è più semplice e affidabile.

## Architettura con Supabase

### Database Schema

Le tabelle principali sono:

1. **documents** - Memorizza informazioni sui PDF caricati
   - id, name, file_url, storage_path, size, vendor_name, status
   - Status: uploading → uploaded → processing → completed/error

2. **comparison_jobs** - Gestisce i job di confronto
   - id, name, status, document_ids, results, error_message
   - Status: created → processing → completed/error

### Storage

- **Bucket**: `pdfs` su Supabase Storage
- Accesso pubblico in lettura per i file
- Politiche RLS configurate per sicurezza

## Setup Supabase

### 1. Creare Progetto

1. Vai su [supabase.com/dashboard](https://supabase.com/dashboard)
2. Crea nuovo progetto
3. Scegli nome e password per il database

### 2. Eseguire Schema

Copia il contenuto di `supabase-schema.sql` nell'editor SQL di Supabase e eseguilo.

### 3. Configurare Environment Variables

Aggiungi al file `.env.local`:

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

## Differenze Rispetto a Convex

### Upload Semplificato

**Prima (Convex):**
- Upload → Storage → Mutation → HTTP API → Processing Pipeline complesso

**Ora (Supabase):**
- Upload diretto a Supabase Storage → Record in database → Processing mock

### Processing

**Prima:**
- Pipeline complesso con OCR, LangChain, domain classification
- Molti step: CREATED → UPLOADED → CLASSIFIED → PARSED → EXTRACTED → NORMALIZED → BUILT → READY

**Ora:**
- Processing semplificato con risultati mock
- Status: created → processing → completed
- Genera dati mock realistici per testing rapido

### Vantaggi

1. **Semplicità**: Meno moving parts, più facile da debuggare
2. **Affidabilità**: Supabase è più stabile di Convex per questo use case
3. **Storage Integrato**: Storage e database in un unico servizio
4. **Setup Facile**: Configurazione guidata nell'interfaccia

## File Modificati

### Nuovi File
- `lib/supabase.ts` - Client e tipi Supabase
- `lib/supabase-service.ts` - Service layer per operazioni DB
- `app/state/comparison-supabase.tsx` - State management con Supabase
- `app/components/setup/supabase-setup.tsx` - Componente setup guidato
- `supabase-schema.sql` - Schema database

### File Modificati
- `app/routes/dashboard/layout.tsx` - Usa nuovo provider
- `app/routes/dashboard/new-comparison.tsx` - Usa nuovo state
- `app/routes/dashboard/index.tsx` - Mostra setup se necessario
- `.env.local` - Aggiunge variabili Supabase

## Testing

Dopo la configurazione:

1. Vai su `/dashboard/new-comparison`
2. Carica 2-3 PDF
3. Avvia processing
4. Verifica che generi una tabella di confronto

## Fallback

Il sistema mantiene il vecchio provider Convex in `app/state/comparison.tsx` come fallback. Per tornare a Convex, basta cambiare gli import nel layout da `comparison-supabase` a `comparison`.

## Roadmap

1. **Fase 1** (Corrente): Sistema funzionante con mock data
2. **Fase 2**: Integrazione OCR worker esistente con Supabase
3. **Fase 3**: Implementazione processing AI completo
4. **Fase 4**: Rimozione sistema Convex legacy