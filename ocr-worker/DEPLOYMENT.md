# OCR Worker Deployment

## Current Deployment

**Service URL**: `https://ocr-worker-2w3lssbkra-uc.a.run.app`  
**Project ID**: `crafty-tracker-469021-k8`  
**Region**: `us-central1`  
**Status**: ✅ Active

## Health Check

```bash
curl https://ocr-worker-2w3lssbkra-uc.a.run.app/health
```

Expected response:
```json
{"service":"ocr-worker","status":"healthy"}
```

## Environment Configuration

### Local Development (.env.local)
```
OCR_WORKER_URL=https://ocr-worker-2w3lssbkra-uc.a.run.app
```

### Convex Environment
```bash
npx convex env set OCR_WORKER_URL https://ocr-worker-2w3lssbkra-uc.a.run.app
```

## Capabilities

- ✅ **Google Cloud Vision API**: Enterprise OCR for scanned documents
- ✅ **Google Cloud Document AI**: Structured document processing (optional)
- ✅ **Tabula Integration**: Native PDF table extraction
- ✅ **PyPDF2 Fallback**: Local development support
- ✅ **Auto-scaling**: 0-10 instances based on load
- ✅ **Large Document Support**: Up to 100MB PDFs
- ✅ **No Page Limits**: Processes complete B2B documents

## Deployment

Run the deployment script:
```bash
cd ocr-worker
./deploy.sh
```

## Monitoring

- **Google Cloud Console**: [Cloud Run Services](https://console.cloud.google.com/run)
- **Logs**: `gcloud logs read --service ocr-worker`
- **Metrics**: Available in Google Cloud Monitoring