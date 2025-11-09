# Woodland Knowledge Data Pipeline

**Purpose**: Centralized, repeatable pipeline to ingest, transform, validate, and index knowledge from multiple sources into LibreChat RAG, Azure AI Search, and Langfuse for AI evaluation.

## Overview

The pipeline processes three primary knowledge sources:

1. **QA Knowledge Base** - Human-validated customer support Q&A from Airtable
2. **AI Training Data** - Curated conversation examples and prompt-response pairs
3. **Sales Team Conversations** - Real customer interaction transcripts from sales team

All sources are normalized, indexed into vector stores, and made available to Woodland AI agents for context-aware responses.

---

## Architecture

```
┌─────────────────┐
│  Data Sources   │
├─────────────────┤
│ • Airtable QA   │──┐
│ • Training Data │──┼──> Transform ──> Validate ──> Index ──> Evaluate
│ • Sales Chat    │──┘
└─────────────────┘
         │
         v
    ┌────────────────────┐
    │  Build Artifacts   │
    ├────────────────────┤
    │ • Normalized CSVs  │
    │ • Langfuse JSON    │
    │ • Markdown (RAG)   │
    └────────────────────┘
         │
         v
    ┌────────────────────┐
    │   Target Systems   │
    ├────────────────────┤
    │ • LibreChat RAG    │
    │ • Azure AI Search  │
    │ • Langfuse Eval    │
    └────────────────────┘
```

---

## Data Sources

### 1. QA Knowledge Base

**Source**: `scripts/Sample Airtable Data - QA.csv`

**Schema**:
```csv
Question ID, Question, Answer, Model, Component, Case, Status, Answer Date, Doc360 URL
```

**Purpose**: Authoritative answers to common customer support questions, validated by domain experts.

**Update Frequency**: Manual export from Airtable when Q&A updated (typically weekly).

### 2. AI Training Data

**Source**: `data/training/*.{json,csv}`

**Schema**:
```json
{
  "id": "train_001",
  "input": "User prompt or question",
  "expected_output": "Ideal AI response",
  "category": "greeting|technical|sales|troubleshooting",
  "metadata": {
    "tone": "professional|friendly|technical",
    "complexity": "basic|intermediate|advanced",
    "created": "ISO-8601 timestamp"
  }
}
```

**Purpose**: Synthetic and curated examples to fine-tune agent behavior, tone, and response patterns.

**Update Frequency**: Continuous addition as new patterns identified.

### 3. Sales Team Conversations

**Source**: `data/sales/conversations/*.{json,csv}`

**Schema**:
```json
{
  "id": "conv_20250108_001",
  "date": "2025-01-08",
  "customer_question": "What's the best model for 2 acres?",
  "sales_response": "For 2 acres, I'd recommend...",
  "outcome": "sale|quote_sent|follow_up|no_sale",
  "metadata": {
    "agent": "John Smith",
    "product_mentioned": ["110 - Commercial PRO"],
    "customer_segment": "residential|commercial",
    "sentiment": "positive|neutral|negative"
  }
}
```

**Purpose**: Real-world customer interactions to ground AI responses in proven sales language and objection handling.

**Update Frequency**: Weekly batch import from CRM or chat logs.

---

## Pipeline Stages

### Stage 1: Extract

**Scripts**: Manual export or API pulls

**Actions**:
- Export latest Airtable QA to `scripts/Sample Airtable Data - QA.csv`
- Pull training data from `data/training/` directory
- Extract sales conversations from CRM/chat system to `data/sales/conversations/`

**Triggers**:
- Manual: `npm run knowledge:extract` (future)
- Scheduled: Weekly cron job (future)

### Stage 2: Transform

**Script**: `scripts/buildKnowledgeDataset.js`

**Actions**:
1. Parse all source files
2. Normalize to unified schema:
   ```json
   {
     "id": "unique_identifier",
     "source": "qa|training|sales",
     "category": "technical|sales|support|general",
     "input": "question or prompt",
     "expected_output": "answer or response",
     "metadata": {
       "source_file": "original filename",
       "model": "product model (if applicable)",
       "component": "component (if applicable)",
       "created": "timestamp",
       "quality_score": 0-100
     }
   }
   ```
3. Clean text:
   - Trim whitespace
   - Fix common typos (e.g., "hanks" → "Thanks")
   - Normalize line endings
   - Remove duplicate entries
4. Generate build artifacts:
   - `build/datasets/qa/langfuse_dataset_variables.csv`
   - `build/datasets/training/langfuse_dataset_variables.csv`
   - `build/datasets/sales/langfuse_dataset_variables.csv`
   - `build/datasets/unified/all_knowledge.csv`
   - `build/markdown/QA_Knowledge_Base.md`
   - `build/markdown/Training_Examples.md`
   - `build/markdown/Sales_Conversations.md`

**Usage**:
```bash
node scripts/buildKnowledgeDataset.js \
  --qa "scripts/Sample Airtable Data - QA.csv" \
  --training "data/training/*.json" \
  --sales "data/sales/conversations/*.json" \
  --output build/datasets
```

**Options**:
- `--dedupe`: Remove duplicates by content similarity
- `--enrich-metadata`: Add computed fields (word count, complexity score)
- `--filter-quality`: Exclude low-quality entries (min answer length, etc.)

### Stage 3: Validate

**Script**: `scripts/validateDataset.js`

**Checks**:
1. **Required Fields**: id, source, input, expected_output
2. **JSON Validity**: All metadata fields parse correctly
3. **Duplicates**: No duplicate IDs within or across sources
4. **Quality Gates**:
   - Answer length >= 20 chars (warning if < 40)
   - Question length >= 5 chars
   - No suspicious patterns (all caps, excessive punctuation)
5. **Cross-Source Consistency**: Same question in multiple sources has similar answers
6. **Stats Report**:
   - Total items per source
   - Avg answer length per source
   - Category distribution
   - Missing metadata fields (% by source)

**Usage**:
```bash
node scripts/validateDataset.js \
  --dir build/datasets \
  --fail-on-warn=false \
  --report build/validation_report.json
```

**Output**:
```json
{
  "timestamp": "2025-01-08T12:00:00Z",
  "summary": {
    "total_items": 1500,
    "qa": 1385,
    "training": 85,
    "sales": 30,
    "errors": 0,
    "warnings": 12
  },
  "issues": [
    {"type": "warning", "source": "qa", "id": "Q-007", "message": "Answer length < 40 chars"},
    {"type": "warning", "source": "sales", "id": "conv_001", "message": "Missing product_mentioned metadata"}
  ]
}
```

### Stage 4: Index

**Scripts**: 
- `scripts/indexKnowledgeBase.js` (unified indexer)
- `scripts/indexQAKnowledge.js` (QA-only, legacy)
- `scripts/indexQAToAzureSearch.js` (QA-only, legacy)

#### 4A: Index to LibreChat RAG

**Unified Indexer** (recommended):
```bash
node scripts/indexKnowledgeBase.js \
  --source build/datasets/unified/all_knowledge.csv \
  --target rag \
  --user-id <admin-user-id> \
  --entity-id agent_woodland_supervisor
```

**Per-Source Indexer** (for granular control):
```bash
# QA only
node scripts/indexQAKnowledge.js \
  --input build/datasets/qa/langfuse_dataset_for_import.csv \
  --user-id <admin-user-id>

# Training data
node scripts/indexKnowledgeBase.js \
  --source build/datasets/training/langfuse_dataset_for_import.csv \
  --target rag \
  --category training

# Sales conversations
node scripts/indexKnowledgeBase.js \
  --source build/datasets/sales/langfuse_dataset_for_import.csv \
  --target rag \
  --category sales
```

**Output**: File ID for each indexed source (store in env vars)

#### 4B: Index to Azure AI Search

**Unified Indexer**:
```bash
node scripts/indexKnowledgeBase.js \
  --source build/datasets/unified/all_knowledge.csv \
  --target azure \
  --index $AZURE_AI_SEARCH_QA_INDEX \
  --create-index
```

**Per-Source Indexer**:
```bash
# QA
node scripts/indexQAToAzureSearch.js \
  --input build/datasets/qa/langfuse_dataset_for_import.csv \
  --index wpp-knowledge-qa \
  --create-index

# Training
node scripts/indexKnowledgeBase.js \
  --source build/datasets/training/langfuse_dataset_for_import.csv \
  --target azure \
  --index wpp-knowledge-training \
  --create-index

# Sales
node scripts/indexKnowledgeBase.js \
  --source build/datasets/sales/langfuse_dataset_for_import.csv \
  --target azure \
  --index wpp-knowledge-sales \
  --create-index
```

**Note**: Can use single unified index with `source` field for filtering, or separate indices per source.

### Stage 5: Configure

Set environment variables to activate indexed knowledge:

**LibreChat RAG**:
```bash
# Enable QA tool
WOODLAND_QA_ENABLED=true
WOODLAND_QA_FILE_ID=<file_id_from_qa_indexing>

# Enable Azure AI Search QA tool
WOODLAND_AZURE_QA_ENABLED=true
AZURE_AI_SEARCH_QA_INDEX=wpp-knowledge-qa

# RAG API endpoint
RAG_API_URL=http://localhost:8001
```

**Azure AI Search**:
```bash
AZURE_AI_SEARCH_SERVICE_ENDPOINT=https://<service>.search.windows.net
AZURE_AI_SEARCH_API_KEY=<admin-key>
AZURE_AI_SEARCH_API_VERSION=2024-07-01
AZURE_AI_SEARCH_QA_INDEX=wpp-knowledge-qa
```

**Azure Embeddings** (for RAG API):
```bash
EMBEDDINGS_PROVIDER=azure
AZURE_OPENAI_API_KEY=<key>
AZURE_OPENAI_ENDPOINT=https://<resource>.openai.azure.com
AZURE_OPENAI_EMBEDDINGS_DEPLOYMENT=text-embedding-ada-002
OPENAI_API_VERSION=2024-08-01-preview
```

### Stage 6: Evaluate (Langfuse)

**Import to Langfuse UI**:
1. Navigate to Langfuse → Datasets → Create/Import
2. Upload `build/datasets/unified/langfuse_dataset_variables.csv`
3. Confirm columns: `variables` (JSON), `expected_output`, `metadata` (JSON)

**Run Evaluation**:
1. Create prompt template in Langfuse with `{{variables.input}}` placeholder
2. Execute batch evaluation referencing dataset
3. Compare model outputs to `expected_output`
4. Track metrics:
   - Substring match %
   - Semantic similarity (cosine)
   - Hallucination rate (mentions non-existent parts/features)
   - Response time
   - Token usage

**Automated Evaluation Script** (future):
```bash
node scripts/evaluateKnowledge.js \
  --dataset build/datasets/unified/langfuse_dataset_variables.csv \
  --prompt-id <langfuse-prompt-id> \
  --metrics similarity,hallucination,tone
```

---

## Incremental Updates

### Detecting Changes

**Compare Workflow**:
```bash
node scripts/buildKnowledgeDataset.js \
  --qa "scripts/Sample Airtable Data - QA.csv" \
  --previous build/datasets/unified/all_knowledge.csv \
  --diff-report build/changelog.json
```

**Diff Report**:
```json
{
  "added": [
    {"id": "Q-999", "source": "qa", "question": "..."}
  ],
  "modified": [
    {"id": "Q-123", "source": "qa", "changes": ["answer"]}
  ],
  "removed": [
    {"id": "Q-456", "source": "qa"}
  ],
  "stats": {
    "added_count": 15,
    "modified_count": 8,
    "removed_count": 2
  }
}
```

### Selective Re-indexing

Only re-index changed items:
```bash
# Build delta dataset
node scripts/buildKnowledgeDataset.js \
  --qa "scripts/Sample Airtable Data - QA.csv" \
  --previous build/datasets/unified/all_knowledge.csv \
  --delta-only \
  --output build/datasets/delta

# Index delta (merge mode)
node scripts/indexKnowledgeBase.js \
  --source build/datasets/delta/all_knowledge.csv \
  --target rag,azure \
  --mode merge
```

---

## Quality Gates

### Transform Stage
- ✅ All source files parseable
- ✅ Deterministic output (sorted by ID)
- ✅ No data loss (input row count ≤ output row count)

### Validation Stage
- ❌ **FAIL** if: Duplicate IDs, missing required fields, invalid JSON
- ⚠️ **WARN** if: Answer < 40 chars, missing optional metadata, suspicious content

### Index Stage
- ✅ File IDs returned from RAG upload
- ✅ Azure upload success rate >= 95%
- ⚠️ Warn if upload takes > 5 minutes

---

## Monitoring & Observability

### Pipeline Metrics
- **Execution time** per stage
- **Record counts** (input → transformed → validated → indexed)
- **Error rates** by source
- **Index freshness** (time since last update)

### Agent Performance Metrics (via Langfuse)
- **QA tool usage rate** (% of queries using QA vs. general knowledge)
- **Answer accuracy** (semantic similarity to expected)
- **Hallucination rate** (invented part numbers, features)
- **User feedback** (thumbs up/down)

### Logging
All scripts log to:
- **Console**: INFO and above
- **File**: `logs/pipeline_<timestamp>.log` (DEBUG and above)

---

## Scheduled Execution

**Recommended Cadence**:
- **QA**: Weekly (after Airtable updates)
- **Training**: Continuous (on git commit to `data/training/`)
- **Sales**: Weekly (batch export from CRM)

**Cron Example** (weekly Sunday 2am):
```bash
0 2 * * 0 cd /path/to/WppAgentLayer && npm run knowledge:pipeline >> logs/cron.log 2>&1
```

---

## NPM Scripts

Add to `package.json`:
```json
{
  "scripts": {
    "knowledge:build": "node scripts/buildKnowledgeDataset.js --qa 'scripts/Sample Airtable Data - QA.csv' --output build/datasets",
    "knowledge:validate": "node scripts/validateDataset.js --dir build/datasets --fail-on-warn=false",
    "knowledge:index:rag": "node scripts/indexKnowledgeBase.js --source build/datasets/unified/all_knowledge.csv --target rag --user-id $ADMIN_USER_ID",
    "knowledge:index:azure": "node scripts/indexKnowledgeBase.js --source build/datasets/unified/all_knowledge.csv --target azure --create-index",
    "knowledge:index": "npm run knowledge:index:rag && npm run knowledge:index:azure",
    "knowledge:pipeline": "npm run knowledge:build && npm run knowledge:validate && npm run knowledge:index"
  }
}
```

**Usage**:
```bash
# Full pipeline
npm run knowledge:pipeline

# Individual stages
npm run knowledge:build
npm run knowledge:validate
npm run knowledge:index:rag
npm run knowledge:index:azure
```

---

## Troubleshooting

### Common Issues

**1. RAG API connection refused**
```
Error: connect ECONNREFUSED 127.0.0.1:8001
```
**Fix**: Ensure `rag_api` container is running:
```bash
docker compose up -d rag_api
docker logs rag_api
```

**2. Azure AI Search 404**
```
Error: Index 'wpp-knowledge-qa' not found
```
**Fix**: Create index with `--create-index` flag:
```bash
node scripts/indexKnowledgeBase.js --target azure --create-index
```

**3. Embedding provider error**
```
Error: OPENAI_API_KEY not set
```
**Fix**: Switch RAG API to Azure embeddings (see docker-compose.override.yml):
```yaml
rag_api:
  environment:
    EMBEDDINGS_PROVIDER: azure
    AZURE_OPENAI_API_KEY: ${AZURE_OPENAI_API_KEY}
    AZURE_OPENAI_ENDPOINT: ${AZURE_OPENAI_ENDPOINT}
    AZURE_OPENAI_EMBEDDINGS_DEPLOYMENT: text-embedding-ada-002
```

**4. Duplicate file_id error**
```
Error: File with file_id already exists
```
**Fix**: Generate new file_id or delete old record:
```bash
# In MongoDB
db.files.deleteOne({file_id: "file_qa_knowledge_..."})
```

**5. Validation fails**
```
❌ Error: Duplicate ID found: Q-123
```
**Fix**: Check source CSV for duplicate Question IDs, dedupe manually or use `--dedupe` flag.

---

## Future Enhancements

### Planned Features
1. **API Pull Automation**: Direct Airtable API integration (no manual export)
2. **CRM Integration**: Automatic sales conversation export from Salesforce/HubSpot
3. **Real-time Updates**: Webhook listeners for instant indexing on data changes
4. **Version Control**: Git-based dataset versioning with diffs
5. **A/B Testing**: Multi-variant prompt evaluation against same dataset
6. **Synthetic Data Generation**: LLM-generated edge cases for training data
7. **Feedback Loop**: User thumbs-up/down → auto-add to training dataset

### Extensibility
Add new data sources by:
1. Creating parser in `scripts/parsers/<source>.js`
2. Mapping to unified schema in `buildKnowledgeDataset.js`
3. Adding source-specific validation rules
4. No changes needed to indexers (they consume unified schema)

---

## Reference

### File Locations
- **Source Data**: `scripts/Sample Airtable Data - QA.csv`, `data/training/`, `data/sales/`
- **Build Artifacts**: `build/datasets/`, `build/markdown/`
- **Logs**: `logs/pipeline_*.log`
- **Scripts**: `scripts/buildKnowledgeDataset.js`, `scripts/validateDataset.js`, `scripts/indexKnowledgeBase.js`

### Environment Variables
See `.env.example` for full list. Critical ones:
- `RAG_API_URL`
- `AZURE_AI_SEARCH_SERVICE_ENDPOINT`
- `AZURE_AI_SEARCH_API_KEY`
- `AZURE_OPENAI_API_KEY`
- `WOODLAND_QA_ENABLED`
- `WOODLAND_AZURE_QA_ENABLED`
- `ADMIN_USER_ID` (MongoDB user _id for file ownership)

### Related Documentation
- `HYBRID_QA_SETUP.md` - Dual QA tool architecture
- `QA_KNOWLEDGE_README.md` - QA-specific indexing guide
- `api/app/clients/agents/Woodland/README.md` - Agent configuration

---

**Last Updated**: 2025-01-08  
**Maintainer**: Woodland Development Team  
**Questions**: See #woodland-agents Slack channel
