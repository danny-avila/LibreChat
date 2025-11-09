# Woodland Knowledge Pipeline

**Standalone knowledge dataset builder for Woodland AI** - Completely independent from LibreChat core, designed to avoid merge conflicts when pulling upstream updates.

## 🎯 Purpose

This pipeline processes multiple knowledge sources (QA, training data, sales conversations, documents) into standardized datasets for:
- LibreChat RAG (PostgreSQL + pgvector)
- Azure AI Search (semantic hybrid search)
- Langfuse evaluation datasets

## 📦 Standalone Design

This directory is **completely self-contained**:
- ✅ Own `package.json` with isolated dependencies
- ✅ Separate `data/` directory for all sources
- ✅ Independent `build/` output directory
- ✅ No modifications to LibreChat core files
- ✅ Safe from upstream merge conflicts

## 🚀 Quick Start

### 1. Install Dependencies

```bash
cd woodland-pipeline
npm install
```

### 2. Run the Pipeline

```bash
# Build datasets from all sources
npm run build

# Validate output quality
npm run validate

# Index to RAG and Azure AI Search (requires LibreChat environment)
npm run index

# Or run full pipeline
npm run pipeline
```

### 3. Test the Pipeline

```bash
# Run end-to-end tests
npm test

# Run just agent integration tests
npm run test:integration

# View test reports
npm run test:report
```
# To run all tests (including agent tests)
See [tests/README.md](tests/README.md) for complete testing documentation.
## To run only agent integration tests

### 4. Preview Without Building

```bash
npm run dry-run
```

## 📁 Directory Structure

```
woodland-pipeline/
├── package.json              # Isolated dependencies
├── scripts/
│   ├── buildKnowledgeDataset.js   # Multi-source dataset builder
│   ├── validateDataset.js         # Quality validation
│   ├── indexQAKnowledge.js        # LibreChat RAG indexer
│   └── indexQAToAzureSearch.js    # Azure AI Search indexer
├── data/
│   ├── qa/
│   │   └── airtable_export.csv    # QA knowledge base
│   ├── training/
│   │   ├── README.md
│   │   └── *.json                 # Training examples
│   ├── sales/
│   │   ├── README.md
│   │   └── *.json                 # Sales conversations
│   └── documents/
│       ├── README.md
│       └── *.docx                 # Word documents (Q&A format)
├── build/
│   ├── datasets/
│   │   ├── qa/
│   │   ├── training/
│   │   ├── sales/
│   │   ├── documents/
│   │   └── unified/
│   │       └── all_knowledge.csv  # Merged dataset
│   └── markdown/                  # Human-readable exports
└── docs/
    ├── QUICKSTART.md              # Getting started guide
    └── DATA_PIPELINE.md           # Architecture documentation
```

## 📝 Data Sources

### 1. QA Knowledge (CSV)
- **Path**: `data/qa/airtable_export.csv`
- **Update**: Export from Airtable weekly
- **Columns**: Question ID, Question, Answer, Model, Component

### 2. Training Data (JSON)
- **Path**: `data/training/*.json`
- **Format**: `{id, input, expected_output, category, metadata}`
- **Use**: Curated conversation examples

### 3. Sales Conversations (JSON)
- **Path**: `data/sales/*.json`
- **Format**: `{id, customer_question, sales_response, outcome, metadata}`
- **Use**: Real customer interaction patterns

### 4. Documents (Word .docx)
- **Path**: `data/documents/*.docx`
- **Format**: Q: question / A: answer patterns
- **Use**: Existing documentation, FAQs, manuals

## 🔧 Environment Variables

Create `.env` in project root (or set in shell):

```bash
# RAG API (LibreChat PostgreSQL + pgvector)
RAG_API_URL=http://localhost:8001

# Azure AI Search
# Primary variable names used by scripts:
#   AZURE_AI_SEARCH_SERVICE_ENDPOINT or AZURE_AI_SEARCH_ENDPOINT
#   AZURE_AI_SEARCH_API_KEY or AZURE_AI_SEARCH_ADMIN_KEY
#   AZURE_AI_SEARCH_QA_INDEX or AZURE_AI_SEARCH_INDEX_NAME
AZURE_AI_SEARCH_SERVICE_ENDPOINT=https://your-search.search.windows.net
AZURE_AI_SEARCH_API_KEY=your-admin-key
AZURE_AI_SEARCH_INDEX_NAME=woodland-qa-hybrid

# Azure OpenAI (for embeddings)
AZURE_OPENAI_API_KEY=your-key
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
AZURE_OPENAI_DEPLOYMENT_NAME=text-embedding-ada-002

# LibreChat Admin User (for RAG indexing)
ADMIN_USER_ID=your-mongodb-user-id
```

## 📊 Build Outputs

### Per-Source Datasets

- `build/datasets/qa/langfuse_dataset_variables.csv`
- `build/datasets/training/langfuse_dataset_variables.csv`
- `build/datasets/sales/langfuse_dataset_variables.csv`
- `build/datasets/documents/langfuse_dataset_variables.csv`

### Unified Dataset

- `build/datasets/unified/all_knowledge.csv` - Merged, ready for indexing

### Markdown Exports

- `build/markdown/QA_Knowledge_Base.md`
- `build/markdown/Training_Examples.md`
- `build/markdown/Sales_Conversations.md`
- `build/markdown/Document_Knowledge.md`

### Validation Report

- `build/validation_report.json` - Quality metrics and issues

## 🔄 Update Workflow

### Weekly QA Update

```bash
# 1. Export from Airtable to data/qa/airtable_export.csv
# 2. Run pipeline
cd woodland-pipeline
npm run pipeline
```

### Add Training Data

```bash
# 1. Create JSON file in data/training/
# 2. Follow schema in data/training/README.md
# 3. Rebuild
npm run build
```

### Add Sales Conversations

```bash
# 1. Export from CRM, anonymize PII
# 2. Save as JSON in data/sales/
# 3. Rebuild
npm run build
```

### Add Document Knowledge

```bash
# 1. Create Word doc with Q: A: format
# 2. Save as .docx in data/documents/
# 3. Rebuild
npm run build
```

## 🔍 Validation

The validator checks:
- ✅ Required fields (id, input, expected_output)

- ✅ JSON parsing (variables, metadata)
- ✅ Duplicate detection (within and across sources)
- ✅ Quality gates (length, formatting, typos)
- ✅ Cross-source consistency

Run standalone:
```bash

npm run validate
```

## 🧪 Testing

The pipeline includes comprehensive end-to-end testing with real agent validation.

### Run Tests

```bash
# Full E2E test suite (build + validate + agent tests)
npm test

# Just build and validate (no agent queries)
npm run build && npm run validate

# Agent integration tests only
npm run test:integration

# View HTML test report
npm run test:report
```

### Setup for Agent Tests

Agent tests query your running LibreChat instance to validate response quality:

```bash
# 1. Ensure LibreChat is running
curl http://localhost:3080

# 2. Get authentication token
#    - Login to LibreChat in browser (http://localhost:3080)
#    - Open DevTools (F12) → Application → Local Storage
#    - Copy the 'token' value

# 3. Run tests with token
export WOODLAND_TEST_TOKEN="your-token-here"
npm test
```
Agent tests query your running LibreChat instance to validate response quality.

#### 1. Ensure LibreChat is running
```bash
curl http://localhost:3080
```

#### 2. Acquire and refresh authentication token

**Option A: Login in browser**
        - Login to LibreChat in browser (http://localhost:3080)
        - Open DevTools (F12) → Application → Local Storage
        - Copy the 'token' value

**Option B: Use helper script for token and refresh token**
        - Run:
                ```bash
                node tests/helpers/getAuthToken.js <email> <password>
                ```
        - Copy both the token and refresh token from the output
        - Set environment variables:
                ```bash
                export WOODLAND_TEST_TOKEN="your-token-here"
                export WOODLAND_REFRESH_TOKEN="your-refresh-token-here"
                ```

**To refresh token automatically when expired:**
        - Use the helper in your test workflow:
                ```js
                const { refreshAuthToken } = require('../helpers/getAuthToken');
                // Example usage:
                const newToken = await refreshAuthToken(process.env.WOODLAND_REFRESH_TOKEN);
                process.env.WOODLAND_TEST_TOKEN = newToken;
                ```

#### 3. Run tests with token
```bash
export WOODLAND_TEST_TOKEN="your-token-here"
# To run all tests (including agent tests)

# To run only agent integration tests
npm run test:integration
```
### Test Reports

After running tests, view detailed metrics:
- **HTML Dashboard**: `tests/reports/pipeline-e2e-report.html`


- **JSON Data**: `tests/reports/pipeline-e2e-report.json`

See [tests/README.md](tests/README.md) for complete testing documentation.

## 🎯 Indexing

### Prerequisites

Before indexing, you need:
1. **User ID**: Get from MongoDB or use `npm run list-users` in parent directory



2. **Environment variables**: Set in parent `.env` file

```bash
# From parent directory, get your user ID
cd ..
npm run list-users

# Copy the user ID, then return to pipeline
cd woodland-pipeline
```

### LibreChat RAG

Indexes to PostgreSQL with pgvector embeddings:

```bash
# Set user ID (replace with your actual user ID)
export ADMIN_USER_ID="68f299dcabf87e83bd2dcbf7"

# Index to RAG
npm run index:rag
```

If port 8000 is occupied (e.g. by `litellm`), the indexer automatically retries `localhost:8001` when `RAG_API_URL` points to `localhost:8000` and the health probe fails.

After upload the indexer polls `/documents/<file_id>/context` to detect readiness. Some RAG deployments respond with `{ status:false, message:'Connection error.', known_type:true }` even when the file was accepted; the pipeline now treats `known_type:true` as success and proceeds.

Quick verification helpers:

```bash
# Verify context endpoint for the KB file
npm run verify

# Run a sample query against the KB
npm run verify:query

# Custom verification
node scripts/verifyEmbedding.js --file-id "$WOODLAND_QA_FILE_ID" --query "oil change interval" --k 3
```

### Azure AI Search

Creates semantic hybrid search index. Script now supports BOTH legacy and new variable names:

Accepted environment variable pairs:

- Endpoint: `AZURE_AI_SEARCH_SERVICE_ENDPOINT` or `AZURE_AI_SEARCH_ENDPOINT`
- Admin Key: `AZURE_AI_SEARCH_API_KEY` or `AZURE_AI_SEARCH_ADMIN_KEY`
- Index Name: `AZURE_AI_SEARCH_QA_INDEX` or `AZURE_AI_SEARCH_INDEX_NAME`

```bash
export AZURE_AI_SEARCH_SERVICE_ENDPOINT=https://your-search.search.windows.net
export AZURE_AI_SEARCH_API_KEY=your-admin-key
export AZURE_AI_SEARCH_INDEX_NAME=woodland-qa-hybrid
npm run index:azure -- --create-index
```

### Both

```bash
npm run index
```

**Note**: Indexing requires the parent LibreChat environment (MongoDB, RAG API, etc.) to be running.

## 🚨 Troubleshooting

### No .docx files parsed

- Ensure files have Q: A: or Question: Answer: format
- Check `data/documents/README.md` for format examples

### CSV parse errors

- Check for unescaped quotes in Airtable export
- Ensure UTF-8 encoding

### Parsed 0 QA pairs

- Ensure you're indexing the unified dataset: `build/datasets/unified/all_knowledge.csv`
- The indexer now supports both schemas:
        - Unified: columns `variables`, `expected_output`, `metadata` (where `variables` contains `{ "input": "..." }`)
        - Airtable export: columns like `Question ID`, `Question`, `Answer`, `Model`, `Component`, `Case`
- If you still get 0 pairs, open the CSV and confirm headers match one of the above.

### RAG API connection refused

- Verify `docker ps | grep rag_api` shows running container
- Check `RAG_API_URL` environment variable
        - Example values: `http://localhost:8000` or the URL of your deployed RAG service

#### Dual Port Setup (Local Docker)

If you use the provided `docker-compose.override.yml`, two services may listen:

- `litellm` on host port **8000** (LLM proxy/monitoring)
- `rag_api` exposed on host port **8001** (container internal port 8000)

Set `RAG_API_URL=http://localhost:8001` when litellm occupies 8000; otherwise the indexer will auto-fallback if `http://localhost:8000` is unreachable.

The indexer tries:

1. `RAG_API_URL` as defined
2. If it contains `localhost:8000` and health check fails, it retries `localhost:8001`

To force a specific port, export the variable explicitly before running:

```bash
export RAG_API_URL=http://localhost:8001
npm run index:rag
```

If you see an upload response with `status:false` but `known_type:true`, run a verification:

```bash
npm run verify
```

and optionally test retrieval:

```bash
npm run verify:query
```

Health check endpoint expected: `GET /health` on the RAG API.

### Azure index not found

- Use `--create-index` flag first time: `npm run index:azure`
- Verify Azure credentials in `.env`

## 📚 Documentation

- **[QUICKSTART.md](docs/QUICKSTART.md)** - Getting started guide
- **[DATA_PIPELINE.md](docs/DATA_PIPELINE.md)** - Architecture and workflows
- **Data READMEs**: Format specifications in each `data/*/README.md`

## 🔗 Integration with LibreChat

The pipeline is **completely independent** but integrates via:

1. **RAG Indexing**: Uses LibreChat's `rag_api` service
2. **Azure Search**: Queries from LibreChat custom tools
3. **Environment**: Shares `.env` for consistency

When `WOODLAND_QA_ENABLED=true` and `WOODLAND_QA_FILE_ID` is set, the Woodland agent automatically injects the KB file (marked `embedded:true`) into its context if missing, ensuring prompt context handlers and the QA tool can access it without manual attachment.

**No LibreChat code modifications required** - safe for upstream pulls!

## 📦 Dependencies

Managed independently in `woodland-pipeline/package.json`:

- `mammoth` - .docx parsing
- `csv-parser` - CSV reading
- `glob` - File pattern matching
- `commander` - CLI arguments
- `axios` - HTTP requests
- `form-data` - Multipart uploads
- `uuid` - Unique ID generation

## 🛠️ Development

### Add New Data Source

1. Create parser function in `scripts/buildKnowledgeDataset.js`
2. Add CLI option in commander config
3. Include in main() workflow
4. Add output directory
5. Update documentation

### Modify Validation Rules

Edit `scripts/validateDataset.js` quality gates and checks.

### Change Output Formats

Modify `generateLangfuseCSV()` and `generateMarkdown()` functions.

## 📄 License

Same as LibreChat parent project.

## 🤝 Contributing

Keep pipeline changes isolated to `woodland-pipeline/` directory to maintain fork compatibility.
