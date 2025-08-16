# CLAUDE.md - Development Guide

This repository contains a production-ready SaaS application built with React Router v7, enhanced with a sophisticated SpecSheet Comparator system for B2B PDF processing and comparison.

## Core Architecture

### Tech Stack
- **Frontend**: React Router v7 + TailwindCSS v4 + shadcn/ui
- **Backend**: Convex (real-time database + serverless functions)
- **Authentication**: Clerk
- **Payments**: Polar.sh
- **AI**: OpenAI + Custom LangChain extraction pipeline
- **Deployment**: Vercel with @vercel/react-router preset

### Project Structure
```
├── app/                    # React Router v7 frontend
│   ├── components/         # UI components
│   ├── routes/             # Route handlers
│   └── utils/             # Utilities
├── convex/                 # Backend functions & SpecSheet pipeline
│   ├── domain_profiles.ts  # Domain-specific extraction configs
│   ├── pipeline.ts         # Main processing pipeline
│   ├── langchain_parser.ts # LangChain extraction
│   ├── extraction_rules.ts # Regex/rule-based extraction
│   ├── unit_converter.ts   # Unit normalization & scoring
│   └── *.ts               # Other specialized modules
├── public/                 # Static assets
└── docs/                  # Documentation
```

## SpecSheet Comparator System

This application includes a comprehensive PDF processing system for B2B document comparison:

### Key Features
1. **Domain-Agnostic Processing**: Supports semiconductors, APIs, software B2B, networking
2. **Multilingual Extraction**: English, Spanish, French, Chinese synonyms
3. **Hybrid Extraction**: Regex rules + LangChain for optimal accuracy
4. **Confidence Scoring**: Multi-factor confidence calculation
5. **Human-in-the-Loop**: User correction workflows with learning
6. **Gold Set Validation**: 20+ manually annotated PDFs for validation

### Critical Files & Functions

#### convex/domain_profiles.ts
Contains domain-specific extraction configurations:
- `SEMICONDUCTORS`: 15 core fields (model, power, voltage, etc.)
- `API_SDK`: 12 core fields (version, authentication, rate limits, etc.)
- Each profile includes synonyms, validation thresholds, canonicalization rules

#### convex/pipeline.ts
Main processing pipeline:
- `processJob()`: Orchestrates the entire extraction workflow
- Schema accepts both `v.id("_storage")` and `v.string()` for `storageId`
- Comprehensive multilingual synonym mapping

#### convex/http.ts
**CRITICAL**: CORS handlers MUST be at the bottom of the file:
```typescript
// === CORS OPTIONS HANDLERS (MUST BE LAST) ===
http.route({
  path: "/api/*", 
  method: "OPTIONS",
  handler: optionsHandler,
});
```

#### convex/langchain_parser.ts
Schema-first LangChain extraction with few-shot examples:
- `generateSchemaPrompt()`: Creates domain-specific prompts
- `getFewShotExamples()`: Provides training examples
- Uses structured output parsing for consistency

#### convex/extraction_rules.ts
High-confidence regex patterns for deterministic extraction:
- Pattern matching for semiconductors, APIs, software B2B, networking
- `applyExtractionRules()`: Fast, accurate extraction for common patterns

#### convex/unit_converter.ts
Comprehensive unit conversion and confidence scoring:
- `convertUnit()`: Handles power, voltage, frequency, data rate conversions
- `calculateCompositeConfidence()`: Multi-factor scoring (extraction method, unit conversion, context clarity, domain relevance)

### API Endpoints & URL Structure

**CRITICAL**: Use `.convex.site` URLs for HTTP calls, NOT `.convex.cloud`
- Correct: `https://your-deployment.convex.site/api/jobs`
- Wrong: `https://your-deployment.convex.cloud/api/jobs`

### Common Issues & Solutions

1. **CORS 404 Errors**: Ensure OPTIONS handlers are at the end of http.ts
2. **Schema Validation**: `storageId` accepts both storage IDs and strings
3. **Job Processing**: Use proper file URIs vs storage IDs based on context
4. **Vercel Deployment**: Use minimal vercel.json, let @vercel/react-router handle routing

## Development Commands

```bash
# Development
npm run dev                 # Start dev server
npx convex dev             # Start Convex backend

# Production
npm run build              # Build for production
npm run typecheck          # TypeScript validation

# Testing
node test_upload_pdfs.js   # Test PDF upload workflow
```

## Environment Variables

### Required for Development
```bash
CONVEX_DEPLOYMENT=your_convex_deployment
VITE_CONVEX_URL=your_convex_url
VITE_CLERK_PUBLISHABLE_KEY=your_clerk_key
CLERK_SECRET_KEY=your_clerk_secret
OPENAI_API_KEY=your_openai_key
FRONTEND_URL=http://localhost:5173
```

### Required for Production
Add Polar.sh credentials:
```bash
POLAR_ACCESS_TOKEN=your_polar_token
POLAR_ORGANIZATION_ID=your_polar_org_id
POLAR_WEBHOOK_SECRET=your_polar_webhook_secret
```

## Vercel Deployment

### Configuration
Use minimal vercel.json:
```json
{
  "buildCommand": "npm run build",
  "env": {
    "NODE_ENV": "production"
  }
}
```

The @vercel/react-router preset handles all routing automatically.

### Deployment Process
1. Push to main branch (auto-deploys)
2. Set environment variables in Vercel dashboard
3. Webhook endpoint: `{your_domain}/webhook/polar`

## Key Routes

### Public Routes
- `/` - Homepage with pricing
- `/pricing` - Dynamic pricing from Polar.sh
- `/sign-in/*` - Authentication
- `/sign-up/*` - Registration

### Protected Routes (Dashboard)
- `/dashboard` - Main dashboard
- `/dashboard/new-comparison` - SpecSheet upload & processing
- `/dashboard/archive` - Processed comparisons
- `/dashboard/stats` - Analytics & KPIs
- `/dashboard/chat` - AI-powered chat
- `/dashboard/settings` - User settings

### API Routes
- `/api/jobs` - Job creation & management
- `/api/jobs/create` - Create new processing job
- `/webhook/polar` - Payment webhook handler

## Data Models

### Job Processing
```typescript
{
  _id: Id<"jobs">,
  userId: string,
  status: "pending" | "processing" | "completed" | "failed",
  files: Array<{
    url?: string,
    storageId?: Id<"_storage"> | string,
    name: string
  }>,
  results?: ExtractionResult[],
  domain: "semiconductors" | "api_sdk" | "software_b2b" | "networking",
  workspace?: Id<"workspaces">
}
```

### Extraction Results
```typescript
{
  confidence: number,
  extracted_fields: Record<string, any>,
  extraction_method: "regex" | "langchain" | "hybrid",
  normalized_units: Record<string, string>,
  raw_text: string,
  file_metadata: FileMetadata
}
```

## Testing & Validation

### Gold Set Validation
The system includes 20+ manually annotated PDFs in convex/gold_set_validation.ts:
- TI TLV320AIC3104 (audio codec)
- Maxim MAX232 (RS-232 transceiver)
- Intel 8051 (microcontroller)
- REST API documentation samples
- SaaS feature comparison sheets

### Quality Metrics
- Extraction accuracy: >95% for high-confidence fields
- Unit conversion accuracy: >99%
- Multilingual synonym matching: >90%
- Processing time: <30s per PDF

## Debugging & Monitoring

### Logs & Debugging
- Convex dashboard: Monitor function execution
- Browser DevTools: Check CORS and API calls
- Vercel logs: Deployment and runtime issues

### KPI Tracking
The system tracks:
- Extraction accuracy by domain
- Processing times and costs
- User correction patterns
- Model performance metrics

## Security Considerations

- Never commit API keys or secrets
- Use Clerk for authentication, not custom auth
- Validate all user inputs in Convex functions
- Sanitize file uploads and limit file sizes
- Use HTTPS in production

## Future Development

### Planned Enhancements
- Additional domain support (automotive, medical devices)
- Advanced comparison algorithms
- Batch processing capabilities
- Integration with more LLM providers
- Enhanced multilingual support

### Architecture Patterns
- Follow existing Convex function patterns
- Use React Router v7 conventions for new routes
- Maintain domain profile structure for new domains
- Follow confidence scoring patterns for new extraction methods

## Support & Resources

- [Convex Documentation](https://docs.convex.dev/)
- [React Router v7 Guide](https://reactrouter.com/en/main)
- [Clerk Authentication](https://clerk.com/docs)
- [Polar.sh Billing](https://docs.polar.sh/)

---

This codebase represents a production-ready SaaS application with sophisticated AI-powered document processing capabilities. The SpecSheet Comparator system demonstrates advanced patterns for domain-specific extraction, multilingual processing, and human-in-the-loop workflows.