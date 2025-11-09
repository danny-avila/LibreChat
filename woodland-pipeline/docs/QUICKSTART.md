# Knowledge Pipeline Quick Start

Multi-source knowledge pipeline for Woodland AI agents, processing QA, training data, and sales conversations into unified vector stores.

## Prerequisites

```bash
# Install dependencies (already done if pipeline scripts run)
npm install csv-parser glob commander

# Ensure RAG API is running
docker compose up -d rag_api
```

## Quick Commands

```bash
# Preview what will be built (no files written)
npm run knowledge:dry-run

# Build all datasets from sources
npm run knowledge:build

# Validate built datasets
npm run knowledge:validate

# Index to LibreChat RAG
npm run knowledge:index:rag

# Index to Azure AI Search
npm run knowledge:index:azure

# Full pipeline (build → validate → index)
npm run knowledge:pipeline
```

## Data Sources

### 1. QA Knowledge Base (116 items currently)
- **File**: `scripts/Sample Airtable Data - QA.csv`
- **Update**: Weekly Airtable export
- **Format**: CSV with Question ID, Question, Answer, Model, Component

### 2. Training Data (5 sample items)
- **Directory**: `data/training/*.json`
- **Update**: Continuous additions
- **Format**: JSON arrays with input, expected_output, category, metadata

### 3. Sales Conversations (5 sample items)
- **Directory**: `data/sales/*.json`
- **Update**: Weekly CRM exports
- **Format**: JSON with customer_question, sales_response, outcome, metadata

### 4. Documents (Word .docx files)
- **Directory**: `data/documents/*.docx`
- **Update**: Continuous additions
- **Format**: Word documents with Q: A: or Question: Answer: format

## Build Outputs

After running `npm run knowledge:build`, find artifacts in:

```
build/
├── datasets/
│   ├── qa/
│   │   └── langfuse_dataset_variables.csv
│   ├── training/
│   │   └── langfuse_dataset_variables.csv
│   ├── sales/
│   │   └── langfuse_dataset_variables.csv
│   ├── documents/
│   │   └── langfuse_dataset_variables.csv
│   └── unified/
│       └── all_knowledge.csv (merged from all sources)
└── markdown/
    ├── QA_Knowledge_Base.md
    ├── Training_Examples.md
    ├── Sales_Conversations.md
    ├── Document_Knowledge.md
    └── All_Knowledge.md
```

## Adding New Data

### QA Knowledge
1. Export updated CSV from Airtable
2. Replace `scripts/Sample Airtable Data - QA.csv`
3. Run `npm run knowledge:build`

### Training Data
1. Create JSON file in `data/training/`
2. Follow schema in `data/training/README.md`
3. Run `npm run knowledge:build`

### Sales Conversations
1. Export from CRM, anonymize PII
2. Save as JSON in `data/sales/`
3. Follow schema in `data/sales/README.md`
4. Run `npm run knowledge:build`

### Document Knowledge (.docx)
1. Create Word document with Q: A: format
2. Save as .docx in `data/documents/`
3. Follow format guidelines in `data/documents/README.md`
4. Run `npm run knowledge:build`

## Environment Setup

Required for indexing:

```bash
# LibreChat RAG
RAG_API_URL=http://localhost:8001
WOODLAND_QA_ENABLED=true
WOODLAND_QA_FILE_ID=<from indexing>

# Azure AI Search
AZURE_AI_SEARCH_SERVICE_ENDPOINT=https://<service>.search.windows.net
AZURE_AI_SEARCH_API_KEY=<admin-key>
AZURE_AI_SEARCH_QA_INDEX=wpp-knowledge-qa
WOODLAND_AZURE_QA_ENABLED=true

# Azure Embeddings (for RAG API)
EMBEDDINGS_PROVIDER=azure
AZURE_OPENAI_API_KEY=<key>
AZURE_OPENAI_ENDPOINT=https://<resource>.openai.azure.com
AZURE_OPENAI_EMBEDDINGS_DEPLOYMENT=text-embedding-ada-002
OPENAI_API_VERSION=2024-08-01-preview
```

## Validation

Pipeline checks:
- ✅ Required fields present
- ✅ Valid JSON in metadata
- ✅ No duplicate IDs
- ✅ Quality gates (min lengths)
- ⚠️ Warnings for sub-optimal content

View validation report:
```bash
cat build/validation_report.json
```

## Troubleshooting

**CSV parse error**
- Check for unescaped quotes in CSV
- Ensure UTF-8 encoding

**Missing IDs**
- Ensure "Question ID" or "ID" column in QA CSV
- Training/sales JSON must have "id" field

**RAG API connection refused**
- Check `docker ps | grep rag_api`
- View logs: `docker logs rag_api`

**Azure index not found**
- Use `--create-index` flag first time
- Verify `AZURE_AI_SEARCH_QA_INDEX` env var

## Full Documentation

See `docs/DATA_PIPELINE.md` for complete pipeline architecture, schemas, and advanced options.

## Current Stats

As of 2025-01-08:
- **Total items**: 126
- **QA**: 116 (Airtable)
- **Training**: 5 (sample)
- **Sales**: 5 (sample)

Run `npm run knowledge:validate` for detailed stats.
