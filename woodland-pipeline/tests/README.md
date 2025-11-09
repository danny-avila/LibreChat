# Woodland Pipeline Testing

Comprehensive end-to-end testing framework for the Woodland Knowledge Pipeline.

## 🎯 Test Suites

### 1. Unit Tests (`tests/unit/`)
Tests individual parsers and functions in isolation.

### 2. Integration Tests (`tests/integration/`)
Tests real Woodland agent responses with knowledge base queries.

### 3. End-to-End Tests (`tests/e2e/`)
Tests complete pipeline workflow: Build → Validate → Index → Query

## 🚀 Running Tests

### Quick Start
```bash
# Run all tests
npm test

# Run specific suite
npm run test:unit
npm run test:integration
npm run test:e2e

# Generate HTML report
npm run test:report
```

### Integration Test (Agent Queries)
```bash
# Set environment variables
export LIBRECHAT_URL=http://localhost:3080
export WOODLAND_TEST_API_KEY=your_api_key

# Run agent integration tests
npm run test:integration
```

**Output**: `tests/reports/integration-test-report.json`

### End-to-End Pipeline Test
```bash
# Minimal (build + validate only)
npm run test:e2e

# Full pipeline (with indexing + agent tests)
export RAG_API_URL=http://localhost:8001
export AZURE_AI_SEARCH_ENDPOINT=https://your-search.search.windows.net
export LIBRECHAT_URL=http://localhost:3080
npm run test:e2e
```

**Output**:
- HTML Report: `tests/reports/pipeline-e2e-report.html`
- JSON Report: `tests/reports/pipeline-e2e-report.json`

## 📊 Test Reports

### HTML Report Features
- ✅ Overall pass/fail status
- 📈 Stage-by-stage breakdown
- 📊 Metrics and statistics
- 🎨 Visual progress indicators
- ⏱️ Performance timing
- 📝 Detailed error messages

### Integration Test Metrics
- **Keyword Match**: Percentage of expected keywords found in responses
- **Quality Score**: Response completeness, length, readability
- **Response Time**: Agent query latency
- **Pass Rate**: Overall test success rate
- **Category Breakdown**: Results by question category

## 🧪 Test Fixtures

### Test Questions (`tests/fixtures/test-questions.json`)
Curated test cases covering:
- Product specifications
- Installation process
- Financial/tax information
- Technical specifications
- Maintenance requirements
- Legal/permitting questions

Each test case includes:
- Question text
- Expected keywords (for validation)
- Category classification

### Adding Test Cases
```json
{
  "id": "test_qa_011",
  "question": "Your test question here?",
  "expected_keywords": ["keyword1", "keyword2", "keyword3"],
  "category": "product_specs"
}
```

## 📋 Test Workflow

### Standard E2E Test Flow
```
1. Build Datasets
   ├─ Parse QA sources (CSV + .docx)
   ├─ Parse training data
   ├─ Parse sales conversations
   └─ Generate unified dataset

2. Validate Datasets
   ├─ Check required fields
   ├─ Validate JSON parsing
   ├─ Detect duplicates
   └─ Apply quality gates

3. Index to RAG (Optional)
   └─ Upload to LibreChat RAG API

4. Index to Azure (Optional)
   └─ Upload to Azure AI Search

5. Agent Integration Tests
   ├─ Query Woodland agents
   ├─ Validate responses
   ├─ Measure quality
   └─ Generate report
```

## 🎯 Success Criteria

### Build Stage
- ✅ All source files parsed successfully
- ✅ Expected item counts met
- ✅ Output files generated

### Validation Stage
- ✅ No critical errors
- ✅ Warnings below threshold
- ✅ All required fields present

### Agent Tests
- ✅ 80%+ pass rate
- ✅ 50%+ keyword match on average
- ✅ 60%+ quality score on average
- ✅ Response time < 5000ms

## 🛠️ Configuration

### Environment Variables

```bash
# LibreChat Integration
LIBRECHAT_URL=http://localhost:3080
WOODLAND_TEST_API_KEY=your_api_key
TEST_USER_ID=mongodb_user_id

# RAG Indexing (Optional)
RAG_API_URL=http://localhost:8001

# Azure AI Search (Optional)
AZURE_AI_SEARCH_ENDPOINT=https://your-search.search.windows.net
AZURE_AI_SEARCH_ADMIN_KEY=your_admin_key
AZURE_AI_SEARCH_INDEX_NAME=woodland-qa-hybrid

# Azure OpenAI (for embeddings)
AZURE_OPENAI_API_KEY=your_key
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
AZURE_OPENAI_DEPLOYMENT_NAME=text-embedding-ada-002
```

### Optional Stages
If environment variables are not set, those stages are skipped:
- RAG indexing → Skipped if no `RAG_API_URL`
- Azure indexing → Skipped if no `AZURE_AI_SEARCH_ENDPOINT`
- Agent tests → Skipped if no `LIBRECHAT_URL`

## 📈 Example Output

### Console Output
```
🚀 Starting Woodland Pipeline End-to-End Tests

============================================================
STAGE 1: BUILD DATASETS
============================================================
📦 Building datasets from all sources...
✅ Building datasets from all sources completed

============================================================
STAGE 2: VALIDATE DATASETS
============================================================
📦 Validating dataset quality...
✅ Validating dataset quality completed

============================================================
STAGE 5: AGENT INTEGRATION TESTS
============================================================
🔍 Testing: test_qa_001
   Question: "What is the warranty period for Woodland solar panels?"
   ✅ PASSED
   Keyword match: 85.0%
   Quality score: 78.5%
   Response time: 1234ms

============================================================
📊 E2E TEST COMPLETE
============================================================
Overall Status: ✅ PASS
Total Time: 45.23s

📄 HTML Report: tests/reports/pipeline-e2e-report.html
📄 JSON Report: tests/reports/pipeline-e2e-report.json
```

### HTML Report Preview
Open `tests/reports/pipeline-e2e-report.html` in browser to see:
- Visual dashboard with metrics
- Stage-by-stage results
- Progress indicators
- Detailed breakdowns

## 🔍 Troubleshooting

### Agent Tests Failing
- Verify `LIBRECHAT_URL` is accessible
- Check API key validity
- Ensure knowledge base is indexed
- Review test questions relevance

### Build Stage Failing
- Check data file formats (CSV, JSON, .docx)
- Verify file permissions
- Review parser error messages

### Validation Warnings
- Review `build/validation_report.json`
- Check for duplicate IDs
- Validate JSON structure in metadata

### Indexing Failures
- Verify RAG API/Azure Search endpoints
- Check authentication credentials
- Review network connectivity
- Confirm index schema compatibility

## 🚀 CI/CD Integration

### GitHub Actions Example
```yaml
name: Pipeline Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: cd woodland-pipeline && npm install
      - run: cd woodland-pipeline && npm run test:e2e
      - uses: actions/upload-artifact@v3
        with:
          name: test-reports
          path: woodland-pipeline/tests/reports/
```

## 📝 Best Practices

1. **Run tests before deployment**: `npm run test:all`
2. **Review HTML reports**: Check detailed metrics
3. **Monitor pass rates**: Maintain >80% agent test success
4. **Update test fixtures**: Add new questions as knowledge grows
5. **Version test reports**: Keep historical reports for comparison

## 🤝 Contributing

When adding features:
1. Add corresponding test cases
2. Update test fixtures if needed
3. Ensure all tests pass
4. Document new test scenarios

---

**Need help?** See [../docs/QUICKSTART.md](../docs/QUICKSTART.md) for pipeline documentation.
