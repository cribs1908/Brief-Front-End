# Setup Supabase Database Schema

Per completare l'implementazione dell'architettura `newintegration.md`, è necessario applicare lo schema del database a Supabase.

## 🔧 **Passo 1: Accedi al Dashboard Supabase**

1. Vai su [https://supabase.com/dashboard](https://supabase.com/dashboard)
2. Accedi al progetto `umflteqpkosigldvitaa` 
3. Vai alla sezione **SQL Editor** nel menu laterale

## 📋 **Passo 2: Applica lo Schema Database**

**⚠️ Se hai già tentato di applicare lo schema e hai ricevuto errori "relation already exists":**

1. Clicca su "New Query" nel SQL Editor
2. Copia tutto il contenuto del file `supabase-reset-and-create.sql` 
3. Incolla il contenuto nell'editor SQL
4. Clicca su "Run" per eseguire lo script

**✅ Se è la prima volta che applichi lo schema:**

1. Clicca su "New Query" nel SQL Editor
2. Copia tutto il contenuto del file `supabase-schema-complete.sql`
3. Incolla il contenuto nell'editor SQL
4. Clicca su "Run" per eseguire lo script

**Il file `supabase-reset-and-create.sql` farà un reset completo e ricreerà tutto da zero, risolvendo eventuali conflitti.**

Lo script creerà:
- ✅ 12 tabelle principali (workspaces, jobs, documents, artifacts, etc.)
- ✅ Indici per le performance
- ✅ Row Level Security (RLS) policies
- ✅ Storage buckets (pdfs, exports)
- ✅ Workspace e profili di default
- ✅ Trigger per updated_at

## 🧪 **Passo 3: Verifica Setup**

Dopo aver applicato lo schema, puoi verificare che tutto funzioni:

```bash
node test_supabase_connection.js
```

Dovresti vedere:
```
✅ Workspaces table accessible
✅ Profiles table accessible  
✅ Storage accessible
✅ Signed upload URL created successfully
🎉 Supabase connection test completed successfully!
```

## 🚀 **Passo 4: Test Frontend**

1. Il dev server dovrebbe essere su `http://localhost:5175`
2. Vai a `/dashboard/new-comparison`
3. Carica 2 PDF di test
4. Avvia il processing
5. Verifica che il sistema generi una tabella di confronto

## 📊 **Struttura Dati Creata**

Il database includerà:

### **Tabelle Core**
- `workspaces` - Multi-tenancy
- `jobs` - Job orchestration  
- `documents` - File metadata
- `artifacts` - Parsed content (Tabula/OCR)
- `extractions_raw` - LangChain output
- `extractions_norm` - Normalized values
- `results` - Final comparison tables

### **Domain Profiles**
- `semiconductors` v1.0 (6 campi: model, power, voltage, frequency, temp, package)
- `api_sdk` v1.0 (6 campi: name, version, auth, rate_limit, latency, uptime)

### **Storage Buckets**
- `pdfs` - PDF uploads (private)
- `exports` - CSV/XLSX exports (private)

## 🔍 **Troubleshooting**

**Error: "Could not find table"**
- Lo schema non è stato applicato correttamente
- Riprova ad eseguire `supabase-schema-complete.sql`

**Error: "Invalid URL"**  
- Verifica che le variabili in `.env.local` siano corrette:
  ```
  VITE_SUPABASE_URL=https://umflteqpkosigldvitaa.supabase.co
  VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...
  ```

**Upload fails**
- Verifica che i bucket `pdfs` siano stati creati
- Controlla le RLS policies nel dashboard

## ✅ **Risultato Finale**

Una volta completato il setup, avrai:

- 🏗️ **API Gateway completo** con orchestrazione async
- 📤 **Upload sicuro** con signed URLs
- 🧠 **Pipeline di processing** mock (Tabula + OCR + LangChain)  
- 📊 **Generazione tabelle** di confronto realistic
- 💾 **Database strutturato** secondo `newintegration.md`
- 🔒 **Security** con RLS e multi-tenancy

Il sistema sarà pronto per l'integrazione con i veri servizi di processing (Tabula, Google Cloud OCR, LangChain) quando necessario.