#!/bin/bash

# OCR Worker Deployment Script for Google Cloud Run
# Production-ready deployment with Google Cloud Vision + Document AI

set -e

echo "🚀 Deploying OCR Worker to Google Cloud Run..."

# Configuration
PROJECT_ID="crafty-tracker-469021-k8"
SERVICE_NAME="ocr-worker"
REGION="us-central1"

# Set gcloud path
GCLOUD_PATH="../google-cloud-sdk/bin/gcloud"
if [ ! -f "$GCLOUD_PATH" ]; then
    echo "❌ gcloud not found. Please install Google Cloud SDK first."
    exit 1
fi

# Set project
echo "Setting up Google Cloud project..."
$GCLOUD_PATH config set project $PROJECT_ID

# Enable required APIs
echo "Enabling Google Cloud APIs..."
$GCLOUD_PATH services enable cloudbuild.googleapis.com
$GCLOUD_PATH services enable run.googleapis.com
$GCLOUD_PATH services enable vision.googleapis.com
$GCLOUD_PATH services enable documentai.googleapis.com

# Build and deploy
echo "Building and deploying OCR Worker..."
$GCLOUD_PATH run deploy $SERVICE_NAME \
  --source . \
  --platform managed \
  --region $REGION \
  --allow-unauthenticated \
  --memory 4Gi \
  --cpu 2 \
  --timeout 600 \
  --max-instances 10 \
  --min-instances 0 \
  --set-env-vars "GOOGLE_CLOUD_PROJECT=$PROJECT_ID" \
  --quiet

# Get service URL
SERVICE_URL=$($GCLOUD_PATH run services describe $SERVICE_NAME --region $REGION --format "value(status.url)")

echo "✅ OCR Worker deployed successfully!"
echo "🌐 Service URL: $SERVICE_URL"
echo ""
echo "📝 Next steps:"
echo "1. Update your .env.local file with:"
echo "   OCR_WORKER_URL=$SERVICE_URL"
echo ""
echo "2. (Optional) To enable Document AI, create a processor and update app.yaml with:"
echo "   DOCUMENT_AI_PROCESSOR_ID: your-processor-id"
echo ""
echo "3. Test the service:"
echo "   curl $SERVICE_URL/health"