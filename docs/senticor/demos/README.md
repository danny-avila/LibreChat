# Demo Materials

This directory contains demo scripts, sample data, and evaluation datasets for the Integrationsbericht use case.

## Demo Scripts

### Current Demo (NEU)
- **Demo-script-integrationsbericht_NEU.md** - Current 6-step demo workflow
- **Demo-NEU-Readiness-Assessment.md** - Readiness assessment for new demo

### Legacy Demo
- **Demo-script-integrationsbericht.md** - Original 8-step demo workflow

## Sample Data

### Conversation Exports
- **Baden-Württemberg_Integration Report.json** - Example conversation for Baden-Württemberg integration report
- **Ministry_AI Introduction.json** - Ministry AI introduction conversation

### RAG Evaluation Data
- **bw_eval_500_2025-10-13.jsonl** - 500 evaluation questions for Baden-Württemberg integration
- **bw_rag_data_description_2025-10-13.md** - Description of RAG evaluation dataset

## Using the Demo Scripts

### Running the 6-Step Demo (NEU)

**Prerequisites**:
1. LibreChat running with KI-Referent agent configured
2. HIVE API and MCP servers operational
3. German legal research MCP available

**Steps**:
1. Follow [Demo-script-integrationsbericht_NEU.md](Demo-script-integrationsbericht_NEU.md)
2. Each step includes:
   - User prompt (what to type)
   - Expected agent behavior
   - Verification criteria

**Automated Testing**:
```bash
# Run E2E test covering all 6 steps
npm run e2e -- e2e/specs/demo-integrationsbericht-complete.spec.ts -g "Complete Demo" --reporter=line
```

See [../E2E-TESTING.md](../E2E-TESTING.md) for details.

## Demo Workflow Overview

### Step 1: Projekt starten & Honeycomb erstellen
Create knowledge graph for tracking 34 integration projects

### Step 2: Pressemitteilung einlesen
Fetch and parse press release URL, extract project data

### Step 3: Rechtliche Grundlagen
Research German laws governing integration (AufenthG, SGB, etc.)

### Step 4: Projekt-Tracking-Struktur
Define entity structure for project tracking through Q1 2026

### Step 5: Berichtsgliederung
Generate report outline based on honeycomb data

### Step 6: Suche & Analyse
Search entities, count projects, verify data completeness

## RAG Evaluation

The `bw_eval_500_2025-10-13.jsonl` file contains 500 test questions for evaluating RAG (Retrieval-Augmented Generation) performance on the Baden-Württemberg integration domain.

**Format**: JSON Lines (one question per line)
```json
{"question": "Welche Integrationsprojekte werden gefördert?", "context": "..."}
```

**Usage**: Performance testing and quality assurance for HIVE RAG API

See [bw_rag_data_description_2025-10-13.md](bw_rag_data_description_2025-10-13.md) for details.

## Related Documentation

- **[../README.md](../README.md)** - Main configuration guide
- **[../E2E-TESTING.md](../E2E-TESTING.md)** - Automated testing
- **[../KI-REFERENT-SYSTEM-AGENT.md](../KI-REFERENT-SYSTEM-AGENT.md)** - Agent configuration
- **[../ARCHITECTURE.md](../ARCHITECTURE.md)** - Technical architecture

---

**Last Updated**: 2025-10-14
