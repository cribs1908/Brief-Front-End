# Deploy su Vercel - Configurazione Supabase

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

# OpenAI
OPENAI_API_KEY=your_openai_api_key_here

# Production Config
VITE_DISABLE_MOCKS=true
NODE_ENV=production
```

### 🆕 **AGGIUNGERE** (Nuove variabili Supabase)
```bash
# Supabase Configuration
VITE_SUPABASE_URL=https://umflteqpkosigldvitaa.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key_here
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
1. **Push su GitHub** 
2. **Configura Vercel Environment Variables** (vedi sopra)
3. **Deploy automatico** da GitHub
4. **Test production** su dominio Vercel

### Post-Deploy Test
- [ ] Homepage carica correttamente
- [ ] Dashboard accessibile con Clerk auth
- [ ] Upload PDF funziona con Supabase
- [ ] Processing genera tabella mock
- [ ] Export CSV/JSON funziona

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