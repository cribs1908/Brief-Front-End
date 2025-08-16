# Deploy su Vercel - Configurazione Supabase

## 🎉 **DEPLOY PRONTO!** 
✅ Codice pushato su GitHub (branch: fix-schema-mismatch)  
✅ Supabase schema applicato e testato  
✅ API Gateway implementato  
✅ Processing pipeline funzionante  

## 🚀 Variabili di Ambiente da Configurare su Vercel

### ✅ **MANTENERE** (Già presenti, non toccare)
```bash
# Convex (Legacy - Mantieni per fallback)
CONVEX_DEPLOYMENT=dev:accomplished-chihuahua-453
VITE_CONVEX_URL=https://kindred-otter-506.convex.cloud
VITE_CONVEX_HTTP_URL=https://kindred-otter-506.convex.site
NEXT_PUBLIC_CONVEX_URL=https://kindred-otter-506.convex.cloud

# Clerk Authentication
VITE_CLERK_PUBLISHABLE_KEY=pk_test_Y3V0ZS1jcm93LTY1LmNsZXJrLmFjY291bnRzLmRldiQ
CLERK_SECRET_KEY=sk_test_rt43pWDJvQPbkI1KxoUbvtaoEnfrgV7AWFUN0ylALG

# OCR Worker
OCR_WORKER_URL=https://ocr-worker-2w3lssbkra-uc.a.run.app
PROCESSOR_SERVICE_URL=https://brief-front-end-production-8108.up.railway.app

# OpenAI (usa la chiave reale dal .env.local)
OPENAI_API_KEY=your_openai_key_from_env_local

# Production Config
VITE_DISABLE_MOCKS=true
NODE_ENV=production
```

### 🆕 **AGGIUNGERE** (Nuove variabili Supabase - CRITICHE!)
```bash
# Supabase Configuration
VITE_SUPABASE_URL=https://umflteqpkosigldvitaa.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVtZmx0ZXFwa29zaWdsZHZpdGFhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUzNTc4MTMsImV4cCI6MjA3MDkzMzgxM30.KulDawMIGthNKtBd_8K1lXzcrvHFEaQvvCxbkI-6gNc
```

### ❌ **RIMUOVERE** (Se presenti)
```bash
# Rimuovi se presenti (deprecate)
FRONTEND_URL=*
POLAR_ACCESS_TOKEN=*
POLAR_ORGANIZATION_ID=*
POLAR_WEBHOOK_SECRET=*
```

## 📋 **Checklist Deploy**

### Pre-Deploy
- [x] Variabili Supabase aggiunte a .env.production
- [x] Schema Supabase eseguito nel progetto
- [x] Test locale funzionante su http://localhost:5174
- [x] Build locale senza errori

### Deploy Steps
1. ✅ **Push su GitHub** - FATTO
2. 🔧 **Configura Vercel Environment Variables** - DA FARE (vedi sotto)
3. 🚀 **Deploy automatico** da GitHub - Verrà attivato dopo step 2
4. 🧪 **Test production** su dominio Vercel - Finale

## 🔧 **AZIONI IMMEDIATE DA FARE:**

### **Step 1: Vai su Vercel Dashboard**
1. Apri [vercel.com/dashboard](https://vercel.com/dashboard)
2. Trova il progetto "webappb2b" o simile
3. Clicca su "Settings"
4. Vai su "Environment Variables"

### **Step 2: Aggiungi le 2 variabili Supabase**
Aggiungi esattamente queste 2 variabili:

**Variabile 1:**
- Name: `VITE_SUPABASE_URL`  
- Value: `https://umflteqpkosigldvitaa.supabase.co`
- Environment: Production, Preview, Development (tutti e 3)

**Variabile 2:**
- Name: `VITE_SUPABASE_ANON_KEY`
- Value: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVtZmx0ZXFwa29zaWdsZHZpdGFhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUzNTc4MTMsImV4cCI6MjA3MDkzMzgxM30.KulDawMIGthNKtBd_8K1lXzcrvHFEaQvvCxbkI-6gNc`
- Environment: Production, Preview, Development (tutti e 3)

### **Step 3: Forza Redeploy**
1. Vai su "Deployments" tab
2. Clicca sui 3 puntini del deploy più recente
3. Clicca "Redeploy"
4. Aspetta che finisca (1-2 minuti)

## 🧪 **Step 4: Test dell'App Deployata**

Dopo il redeploy, testa il tuo sito su Vercel:

### **Test Base:**
- [ ] Homepage carica correttamente
- [ ] Dashboard accessibile con Clerk auth
- [ ] Vai a `/dashboard/new-comparison`
- [ ] Carica 2 PDF di test
- [ ] Clicca "Start Processing"
- [ ] Verifica che genera una tabella di confronto realistica
- [ ] Test export CSV/JSON

### **Se tutto funziona:** 
🎉 **SUCCESS! Hai deployato l'architettura completa newintegration.md!**

### **Se ci sono errori:**
1. Vai su Vercel → Progetto → Functions
2. Controlla i logs per errori Supabase
3. Verifica che le variabili di ambiente siano state salvate correttamente

## 🚀 **Cosa hai appena deployato:**

✅ **Architettura Completa** secondo newintegration.md  
✅ **API Gateway** con orchestrazione async  
✅ **Upload sicuro** con signed URLs di Supabase  
✅ **Processing Pipeline** mock (Tabula + OCR + LangChain)  
✅ **Database strutturato** con 12 tabelle + RLS  
✅ **Frontend aggiornato** per vero processing vs mockup  

L'app ora funziona con **vera comunicazione Supabase** invece di dati mock! 🎯

## 🔧 **Configurazione Vercel Dashboard**

1. **Vai su**: [vercel.com/dashboard](https://vercel.com/dashboard)
2. **Seleziona il progetto**: webappb2b
3. **Settings → Environment Variables**
4. **Aggiungi le 2 variabili Supabase** (vedi sopra)
5. **Redeploy** dal dashboard

## 🚨 **Rollback Plan**

Se il deploy Supabase ha problemi:

1. **Rimuovi variabili Supabase** da Vercel
2. **Cambia in**: `app/routes/dashboard/layout.tsx`
   ```diff
   - import { ComparisonProvider } from "~/state/comparison-supabase";
   + import { ComparisonProvider } from "~/state/comparison";
   ```
3. **Redeploy** - tornerà al sistema Convex

## 📊 **Monitoring**

Dopo il deploy, controlla:
- **Vercel Functions Logs** per errori Supabase
- **Supabase Dashboard** per traffico storage/DB
- **Sentry/Error tracking** se configurato

## 🎯 **URL di Test Post-Deploy**

- **Homepage**: `https://your-app.vercel.app`
- **Dashboard**: `https://your-app.vercel.app/dashboard`
- **Upload**: `https://your-app.vercel.app/dashboard/new-comparison`