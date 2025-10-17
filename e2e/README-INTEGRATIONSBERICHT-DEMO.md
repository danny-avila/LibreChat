# Integrationsbericht BW 2025 - E2E Demo Test

## Overview

This E2E test validates the complete Integrationsbericht Baden-Württemberg 2025 demo flow, covering all 10 steps as documented in `docs/senticor/demos/Demo-script-integrationsbericht.md`.

## Test File

`e2e/specs/integrationsbericht-full-demo.spec.ts`

## What It Tests

### All 10 Demo Steps:

1. **Projekt starten** - Project initialization with honeycomb creation
2. **Pressemitteilung einlesen** - Fetch and parse press release from BW ministry
3. **Rechtliche Grundlagen** - Legal research using rechtsinformationen MCP
4. **Projekt-Tracking** - Project tracking structure recommendations
5. **Berichtsgliederung** - Report outline generation
6. **Suche & Analyse** - Search knowledge graph for volunteer projects
7. **OSINT Agent Team** 🆕 - Deep research using collaborative AI agents
8. **Vorschriften Q&A** - Legal Q&A about integration courses
9. **Textgenerierung** - Generate project summary text
10. **Graph-Visualisierung** - Graph visualization guidance
11. **Nutzer-Feedback** - Data correction guidance

### Additional Health Checks:

- **MCP Servers Health Check** - Verifies all 4 MCP servers are available:
  - honeycomb (HIVE knowledge graph)
  - rechtsinformationen (German legal codes)
  - fetch (web content fetching)
  - osint-agent-teams (OSINT research) 🆕

## Prerequisites

### Required Services Running:

1. **LibreChat** - `http://localhost:3080`
   - Backend API running
   - Agents endpoint configured
   - MCP servers initialized

2. **HIVE Honeycomb API** - `http://localhost:8000`
   - FastAPI backend for knowledge graph
   - Fuseki triple store accessible

3. **Agentic Researcher Backend** - `http://localhost:8080`
   - FastAPI backend for OSINT agent teams
   - Required for Step 6a (OSINT research)

4. **MCP Servers** (all must be initialized):
   - honeycomb MCP (Node.js)
   - rechtsinformationen MCP (uvx)
   - fetch MCP (uvx)
   - osint-agent-teams MCP (Python) 🆕

## Running the Test

### Basic Run (Headless):

```bash
npx playwright test e2e/specs/integrationsbericht-full-demo.spec.ts
```

### Headed Mode (Show Browser):

```bash
HEADED=true npx playwright test e2e/specs/integrationsbericht-full-demo.spec.ts
```

### With Detailed Logging:

```bash
npx playwright test e2e/specs/integrationsbericht-full-demo.spec.ts --reporter=line
```

### Run Specific Test:

```bash
# Full demo (all 10 steps)
npx playwright test e2e/specs/integrationsbericht-full-demo.spec.ts -g "Complete Demo"

# Health check only
npx playwright test e2e/specs/integrationsbericht-full-demo.spec.ts -g "Health Check"
```

## Test Duration

- **Full Demo**: ~30 minutes (includes real AI responses + OSINT research)
- **Health Check**: ~2 minutes

## Expected Behavior

### Step-by-Step Progress:

```
🎬 Starting FULL Integrationsbericht BW 2025 Demo (All 10 Steps)

📋 Selecting Agents endpoint...
✅ Agents endpoint selected

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📝 STEP 1: Projekt starten & Wissensgraph erstellen
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📤 Sent: Ich erstelle den Integrationsbericht...
⏳ Waiting for AI response...
✅ Response received containing: honeycomb
✅ Step 1 Complete: AI suggested honeycomb creation

[... continues for all 10 steps ...]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ VERIFICATION: Checking conversation completeness
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ Step 1: Honeycomb creation: Found
✅ Step 2: Press release: Found
✅ Step 3: Legal research: Found
[...]

📊 Verification: 10/11 steps confirmed

🎉 FULL DEMO COMPLETE - ALL 10 STEPS!
```

### Screenshot Output:

Final screenshot saved to:
```
./e2e/screenshots/integrationsbericht-full-demo-complete.png
```

## Success Criteria

The test passes if:

1. ✅ All 10 steps execute without errors
2. ✅ At least 8/11 verification checks pass
3. ✅ At least 3/4 MCP servers are available (health check)
4. ✅ AI responses contain expected keywords for each step
5. ✅ OSINT agent team research completes (Step 6a) 🆕

## Troubleshooting

### Common Issues:

#### 1. Test Fails at Login/Registration

**Symptom**: `Error: Timeout waiting for URL /c/`

**Fix**:
```bash
# Ensure LibreChat is running
docker-compose up -d
# Wait for startup
sleep 10
```

#### 2. MCP Servers Not Available

**Symptom**: Health check shows missing MCP servers

**Fix**:
```bash
# Check MCP initialization in logs
docker logs LibreChat 2>&1 | grep MCP

# Restart if needed
docker-compose restart api
```

#### 3. OSINT Agent Team Timeout

**Symptom**: Step 6a times out after 5 minutes

**Fix**:
```bash
# Verify agentic researcher backend is running
curl http://localhost:8080/docs

# Check if port 8080 is accessible from Docker
docker exec LibreChat sh -c "nc -zv host.docker.internal 8080"
```

#### 4. Agents Endpoint Not Available

**Symptom**: `Could not select Agents endpoint`

**Fix**:
- Ensure agents endpoint is configured in librechat.yaml
- Check that you have at least one agent configured
- Test will continue with default endpoint

#### 5. Honeycomb API Not Responding

**Symptom**: Timeout on honeycomb operations

**Fix**:
```bash
# Check HIVE backend
curl http://localhost:8000/health

# Check Fuseki triple store
curl http://localhost:3030/$/ping
```

## Debugging

### Enable Debug Logging:

```bash
# Set environment variable
export DEBUG=pw:api

# Run with debug output
npx playwright test e2e/specs/integrationsbericht-full-demo.spec.ts --debug
```

### Check Browser Console:

```bash
# Run in headed mode with console output
HEADED=true npx playwright test e2e/specs/integrationsbericht-full-demo.spec.ts
```

### Inspect Test Artifacts:

```bash
# View screenshots
open ./e2e/screenshots/

# View test report
npx playwright show-report
```

## CI/CD Integration

### GitHub Actions Example:

```yaml
name: E2E Demo Test

on:
  push:
    branches: [main]
  pull_request:

jobs:
  e2e-demo:
    runs-on: ubuntu-latest
    timeout-minutes: 45

    services:
      librechat:
        image: ghcr.io/danny-avila/librechat-dev:latest
        ports:
          - 3080:3080
        env:
          MONGO_URI: mongodb://mongodb:27017/LibreChat

    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright
        run: npx playwright install --with-deps

      - name: Wait for services
        run: |
          timeout 120 bash -c 'until curl -f http://localhost:3080; do sleep 5; done'

      - name: Run demo test
        run: npx playwright test e2e/specs/integrationsbericht-full-demo.spec.ts

      - name: Upload screenshots
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: demo-screenshots
          path: e2e/screenshots/
```

## Maintenance

### Updating the Test:

When the demo script changes, update the test in these areas:

1. **Step Messages**: Update prompts in each step's `sendMessageAndWaitForResponse` call
2. **Verification Regex**: Update `waitForText` regex patterns if expected responses change
3. **Verification Checks**: Update the final verification section if steps are added/removed
4. **Timeout**: Adjust `FULL_DEMO_TIMEOUT` if demo duration changes

### Test Data Cleanup:

The test uses a dedicated demo user: `full-demo@senticor.de`

To reset demo state:
```bash
# Delete demo user's data
docker exec LibreChat npm run delete-user -- --email full-demo@senticor.de

# Clear honeycomb
curl -X DELETE http://localhost:8000/honeycomb/hc_integrationsbericht_baden_wuerttemberg_2025
```

## Performance Benchmarks

### Expected Timings:

| Step | Expected Duration | Notes |
|------|------------------|-------|
| 1. Projekt starten | 15-30s | Honeycomb creation |
| 2. PM einlesen | 20-40s | Web fetch + parsing |
| 3. Rechtsgrundlagen | 30-60s | Legal API queries |
| 4. Tracking | 10-20s | Advice generation |
| 5. Gliederung | 15-30s | Outline generation |
| 6. Suche | 15-30s | Graph search |
| 6a. OSINT (NEW!) | 60-180s | Agent team research 🤖 |
| 7. Vorschriften | 20-40s | Legal Q&A |
| 8. Textgenerierung | 20-40s | Summary generation |
| 9. Graph-Viz | 10-20s | Visualization advice |
| 10. Feedback | 10-20s | Correction advice |

**Total**: ~5-15 minutes (normal), up to 30 minutes (worst case with slow AI)

## Related Documentation

- Demo Script: `docs/senticor/demos/Demo-script-integrationsbericht.md`
- OSINT Agent Team Setup: `docs/senticor/MCP-OSINT-AgentTeam-Feedback.md`
- LibreChat Configuration: `librechat.yaml`
- Docker Compose Override: `docker-compose.override.yaml`

## Support

For issues with this test:
1. Check this README's troubleshooting section
2. Review LibreChat logs: `docker logs LibreChat`
3. Check MCP server logs in `./logs/`
4. Verify all prerequisites are running
5. Try running the demo manually first to isolate issues
