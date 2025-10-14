# Demo Script NEU - Readiness Assessment

**Date**: 2025-10-14
**Status**: HIVE API Running ✅
**Focus**: Pure demo flow (Steps 1-10) without persona use cases

---

## Executive Summary

**Demo Duration**: 15-25 minutes
**Steps**: 10 total
**Current Readiness**: Steps 1-8 ready, Steps 9-10 need development

✅ **HIVE API Status**: Running at localhost:8000 (703 triples)
✅ **MCP Servers**: 3 configured (honeycomb, rechtsinformationen, fetch)
✅ **LibreChat**: Agents endpoint with proactive instructions

---

## ✅ READY TO DEMO (Steps 1-8)

### Step 1: Project Start (2-3 min)
**What happens**: User describes integration report project → Agent proactively suggests creating honeycomb

**MCP Tools**:
- ✅ `create_honeycomb` - Creates knowledge graph

**Status**: **PRODUCTION READY**

**Example prompt**:
```
Ich erstelle den Integrationsbericht Baden-Württemberg 2025 für die
Veröffentlichung im Q1 2026. Das Kernstück ist ein Update zu 34 lokalen
Integrationsprojekten. Hier ist die Pressemitteilung dazu:
https://sozialministerium.baden-wuerttemberg.de/de/service/presse/pressemitteilung/pid/land-foerdert-34-lokale-integrationsprojekte-mit-rund-18-millionen-euro
```

**Expected outcome**: Honeycomb created with descriptive name and context

---

### Step 2: Pressemitteilung einlesen (3-4 min)
**What happens**: Agent fetches URL → Extracts projects, organizations, ministry → Adds to graph with sources

**MCP Tools**:
- ✅ `fetch` - Reads web content
- ✅ `batch_add_entities` - Adds entities to graph

**Status**: **PRODUCTION READY**

**Expected outcome**:
- 1 Ministry entity
- 5+ example projects
- 5+ organizations
- All with source URLs and dates

---

### Step 3: Rechtliche Grundlagen recherchieren (3-4 min)
**What happens**: Agent searches German law database → Retrieves relevant paragraphs → Adds to graph

**MCP Tools**:
- ✅ `deutsche_gesetze_suchen` - Search laws
- ✅ `get_paragraph` - Get full paragraph text
- ✅ `batch_add_entities` - Add legal texts to graph

**Status**: **PRODUCTION READY**

**Example prompt**:
```
Welche Gesetze regeln Integration in Baden-Württemberg?
Ich brauche die rechtliche Grundlage für Kapitel 2 des Berichts.
```

**Expected outcome**:
- 15+ legal paragraphs from SGB XII, AufenthG, IntG
- Each with official gesetze-im-internet.de URL
- Full paragraph text stored in graph

---

### Step 4: Projekt-Tracking vorbereiten (2-3 min)
**What happens**: Agent creates structured tracking placeholders for each project

**MCP Tools**:
- ✅ `batch_add_entities` - Create ProjectStatus entities

**Status**: **PRODUCTION READY**

**Example prompt**:
```
Bis Q1 2026 muss ich für jedes Projekt dokumentieren:
- Zielerreichung und Kennzahlen
- Herausforderungen
- Best Practices

Wie strukturiere ich das am besten?
```

**Expected outcome**:
- Status-Update entities for each project
- Fields for: Zielerreichung, Kennzahlen, Herausforderungen, Best Practices, Nachhaltigkeit

---

### Step 5: Berichtsgliederung generieren (2-3 min)
**What happens**: Agent analyzes graph structure → Generates table of contents

**MCP Tools**:
- ✅ `get_honeycomb_stats` - Get entity counts
- ✅ `get_honeycomb` - Get full structure

**Status**: **PRODUCTION READY**

**Example prompt**:
```
Erstelle eine Gliederung für den Integrationsbericht basierend auf
den Daten, die wir bisher gesammelt haben.
```

**Expected outcome**:
- Hierarchical outline with 6 chapters + appendix
- Based on actual graph contents
- Markdown formatted

---

### Step 6: Suche & Analyse (2-3 min)
**What happens**: User queries graph → Agent finds matching entities → Offers thematic grouping

**MCP Tools**:
- ✅ `search_entities` - Full-text search
- ✅ `get_honeycomb` - Retrieve structure

**Status**: **PRODUCTION READY**

**Example prompts**:
```
Finde alle Projekte, die sich mit Ehrenamt beschäftigen.

Zeige mir die vollständige Struktur des Wissensgraphen.
```

**Expected outcome**:
- Search results with source attribution
- Graph visualization URL
- Suggestions for thematic analysis

---

### Step 7: Auskunft zu Vorschriften (2-3 min) 🆕
**What happens**: User asks legal question → Agent queries stored paragraphs → Provides answer with citations

**MCP Tools**:
- ✅ `search_entities` - Find relevant paragraphs
- ✅ Agent LLM - Synthesize answer

**Status**: **SHOULD WORK** (uses existing tools, not explicitly tested)

**Example prompt**:
```
Ich möchte im Bericht erwähnen, welche gesetzlichen Grundlagen es
für Integrationskurse gibt. Was sind dazu die wichtigsten Regelungen?
```

**Expected outcome**:
- Answer citing AufenthG §43, §44, §44a
- Official URLs included
- Reference to PartIntG BW

---

### Step 8: Generierung von Berichtstext (2-3 min) 🆕
**What happens**: User requests text snippet → Agent retrieves project data → Generates summary with citations

**MCP Tools**:
- ✅ `search_entities` or `get_honeycomb` - Retrieve project data
- ✅ Agent LLM - Generate text

**Status**: **SHOULD WORK** (standard RAG pattern)

**Example prompt**:
```
Bitte formuliere eine kurze Zusammenfassung für das Projekt
"Zusammen stark im Ehrenamt" (Landkreis Karlsruhe) für den Bericht.
```

**Expected outcome**:
- 3-5 sentence summary
- Includes key facts (1.8 Mio €, 34 projects)
- Source citation (PM 15.03.2024)

---

## 🔴 NEEDS DEVELOPMENT (Steps 9-10)

### Step 9: Graph-Visualisierung & Datenpflege (3-4 min) 🆕

**Concept**: Role-specific graph views + data quality badges

**What's described in demo**:
```
- Rollenspezifische Sichten (Sachbearbeitung, Projektleitung, Führung)
- Badges: "aktuell", "prüfen", "veraltet", "KPI fehlt", "Risiko"
- Datenlebenszyklus-Felder: valid_from, valid_to, source_date,
  last_verified_at, review_due_at, stale_status
```

**Status**: 🔴 **NOT IMPLEMENTED**

#### Required Development:

**A. HIVE API** (2-3 weeks):
- ❌ Add lifecycle fields to entity schema
- ❌ Badge calculation logic (based on dates)
- ❌ Role-based view filtering API
- ❌ Named Graphs for versioning

**B. HIVE MCP Server** (1-2 weeks):
- ❌ `set_graph_view` tool
- ❌ Lifecycle field CRUD operations

**C. HIVE UI** (2-4 weeks):
- ❌ Role selector in UI
- ❌ Badge visualization on nodes
- ❌ Color coding (green/yellow/red)
- ❌ Filter by badge status

**Total Effort**: **4-8 weeks** across 3 teams

**Complexity**: HIGH - Requires coordination

---

### Step 10: Nutzer-Feedback & lernende KI (2-3 min) 🆕

**Concept**: Users report issues → AI suggests corrections → Reviewers approve

**What's described in demo**:
```
- Feedback panel: "Dubletten melden", "Kante korrigieren", "Quelle aktualisieren"
- AI-powered diff preview
- Review workflow with approval
- Audit trail and versioning
- Evaluation metrics: Antwortabdeckung, Zitationsquote, Aktualitäts-Score
```

**Status**: 🔴 **NOT IMPLEMENTED**

#### Required Development:

**A. HIVE API** (3-4 weeks):
- ❌ Feedback collection endpoints
- ❌ Diff generation algorithm
- ❌ Review workflow state machine
- ❌ Versioning system
- ❌ Audit trail logging

**B. HIVE MCP Server** (1-2 weeks):
- ❌ `open_feedback_panel` tool
- ❌ `submit_correction` tool
- ❌ `merge_duplicates` tool
- ❌ `update_source` tool
- ❌ `approve_change` tool

**C. LibreChat Integration** (2-3 weeks):
- ❌ Feedback UI panel
- ❌ Diff preview display
- ❌ Review queue UI

**D. Metrics System** (2-3 weeks):
- ❌ Metrics tracking backend
- ❌ CSAT survey integration
- ❌ Dashboard for monitoring

**Total Effort**: **8-12 weeks** across multiple teams

**Complexity**: VERY HIGH - New infrastructure + ML components

---

## 🔴 NOT PART OF DEMO FLOW

### Persona-Based Use Cases (Moved to Future Work)

The following section from the NEU document is **OUT OF SCOPE** for the demo:

- ❌ "🆕 Persona-basierte Use Cases (konkret & leicht realisierbar)"
- ❌ 12 use cases across 6 personas (Sachbearbeitung, Projektleitung, etc.)
- ❌ Detailed business value calculations per persona

**Reason**: These distract from the clean demo flow. They're valuable for business cases but not for demonstrating the technical capabilities.

**Future consideration**: Can be developed as separate documentation for stakeholder presentations.

---

## 🔴 EVALUATION DATASETS - NOT CREATED

The demo references these files that **don't exist**:

- ❌ `bw_eval_500_2025-10-13.jsonl` - 500 benchmark examples
- ❌ `bw_rag_data_description_2025-10-13.md` - RAG documentation

**Impact on demo**: None - these are for quality assurance, not demo execution

**Future work**: Create evaluation datasets after demo is proven working

**Estimated effort**: 3-4 weeks

---

## ✅ CURRENT SYSTEM STATUS

### Infrastructure:
- ✅ **HIVE API**: Running at localhost:8000 (703 triples)
- ✅ **LibreChat**: Agents endpoint configured
- ✅ **Podman networking**: host.containers.internal routing works

### MCP Servers:
| Server | Status | Location | Tools |
|--------|--------|----------|-------|
| honeycomb | ✅ Configured | /app/mcp-servers/honeycomb | 9 tools |
| rechtsinformationen | ✅ Configured | /app/mcp-servers/rechtsinformationen | 6 tools |
| fetch | ✅ Configured | uvx mcp-server-fetch | 1 tool |

### Agent Configuration:
- ✅ Proactive instructions in [librechat.yaml](../../librechat.yaml)
- ✅ German language support
- ✅ Demo-specific prompts configured

---

## 🐛 KNOWN ISSUES

### 1. Nested Object Bug (WORKAROUND IN PLACE)
**Issue**: LibreChat strips nested objects from MCP tool parameters

**Affected tool**: `add_entity_to_honeycomb`

**Workaround**: ✅ Use `batch_add_entities` instead (works correctly)

**Fix needed**: LibreChat team (in `api/server/services/MCP/client.ts`)

**Documentation**: [LIBRECHAT-MCP-BUG-NESTED-OBJECTS.md](LIBRECHAT-MCP-BUG-NESTED-OBJECTS.md)

**Impact on demo**: None - workaround is reliable

---

### 2. MCP Sampling Not Supported (WORKAROUND IN PLACE)
**Issue**: MCP servers can't request LLM completions from LibreChat

**Impact**: Medium - limits autonomous reasoning in MCP servers

**Workaround**: ✅ Return structured prompts for agent's LLM to process

**Documentation**: [HIVE-MCP-WORKAROUND-WITHOUT-SAMPLING.md](HIVE-MCP-WORKAROUND-WITHOUT-SAMPLING.md)

**Impact on demo**: None - current approach works well

---

## 🎯 DEMO READINESS ASSESSMENT

### Steps 1-8: ✅ READY NOW

| Step | Description | Status | Risk |
|------|-------------|--------|------|
| 1 | Project Start | ✅ Ready | Low |
| 2 | Press Release Reading | ✅ Ready | Low |
| 3 | Legal Research | ✅ Ready | Low |
| 4 | Project Tracking | ✅ Ready | Low |
| 5 | Report Structure | ✅ Ready | Low |
| 6 | Search & Analysis | ✅ Ready | Low |
| 7 | Legal Q&A | 🟡 Untested* | Medium |
| 8 | Text Generation | 🟡 Untested* | Medium |

\* Uses existing tools in new combination - should work but needs testing

**Recommendation**: Test Steps 7-8 once, then ready for demo

---

### Steps 9-10: 🔴 NOT READY

| Step | Description | Effort | Complexity |
|------|-------------|--------|------------|
| 9 | Role-Based Views | 4-8 weeks | HIGH |
| 10 | Feedback & Learning | 8-12 weeks | VERY HIGH |

**Recommendation**:
- **Option A**: Demo Steps 1-8 only (15-20 min demo)
- **Option B**: Add mockups/slides for Steps 9-10 (conceptual preview)
- **Option C**: Develop Steps 9-10 for future demo (3-4 months timeline)

---

## 📋 PRE-DEMO CHECKLIST

### Required Before Demo:

- [x] HIVE API running at localhost:8000
- [ ] senticor-hive-mcp built and mounted
  ```bash
  cd /Users/wolfgang/workspace/senticor-hive-mcp
  npm run build
  ls -la dist/index.js  # Verify
  ```
- [ ] LibreChat running with agents endpoint
- [ ] Test Steps 1-6 end-to-end once
- [ ] Test Step 7 (Legal Q&A) with sample question
- [ ] Test Step 8 (Text Generation) with project summary
- [ ] Verify graph visualization works at localhost:8000
- [ ] Prepare demo script with exact prompts
- [ ] Optional: Record demo video for reference

### Configuration Updates:

- [ ] Update librechat.yaml honeycomb instructions:
  ```yaml
  ## CRITICAL: Always use batch_add_entities

  ✅ ALWAYS use batch_add_entities (even for single entity)
  ❌ NEVER use add_entity_to_honeycomb (LibreChat bug)
  ```

- [ ] Restart LibreChat after config update:
  ```bash
  podman restart LibreChat
  ```

---

## 🎬 DEMO EXECUTION PLAN

### Option A: Core Demo (Steps 1-8 only)

**Duration**: 15-20 minutes
**Readiness**: High
**Risk**: Low

**Content**:
1. Introduction (1 min)
2. Live execution of Steps 1-8 (14-16 min)
3. Conclusion showing final graph (2-3 min)

**Advantages**:
- ✅ All functionality works today
- ✅ Low risk of technical issues
- ✅ Shows real value
- ✅ Impressive without over-promising

**Suitable for**: Technical audiences, stakeholders who value working software

---

### Option B: Extended Demo (Steps 1-8 + Conceptual 9-10)

**Duration**: 20-25 minutes
**Readiness**: Medium
**Risk**: Medium (if mockups not ready)

**Content**:
1. Introduction (1 min)
2. Live execution of Steps 1-8 (14-16 min)
3. Slides/mockups showing Steps 9-10 vision (4-6 min)
4. Conclusion (2 min)

**Advantages**:
- ✅ Shows current capabilities
- ✅ Presents future vision
- ✅ Demonstrates roadmap thinking

**Requires**:
- Mockups or slides for Steps 9-10 UI
- Clear messaging: "Available today" vs. "Coming soon"

**Suitable for**: Executive audiences, investors, strategic partners

---

### Option C: Wait for Full Demo (All 10 Steps)

**Duration**: 25-30 minutes
**Readiness**: Not ready (3-4 months development)
**Risk**: High (complex new features)

**Not recommended** unless there's a specific deadline 4+ months away

---

## 🚀 RECOMMENDED NEXT STEPS

### This Week:

1. **Verify build** (15 min):
   ```bash
   cd /Users/wolfgang/workspace/senticor-hive-mcp
   npm run build
   podman restart LibreChat
   ```

2. **End-to-end test** (1-2 hours):
   - Run through Steps 1-6 with real press release
   - Test Step 7 with 2-3 legal questions
   - Test Step 8 with project summary generation
   - Verify graph visualization

3. **Create demo script** (1 hour):
   - Exact prompts for each step
   - Expected outcomes
   - Backup prompts if agent gets confused

4. **Practice run** (30 min):
   - Execute full demo
   - Time each step
   - Identify any rough edges

### Next Week:

1. **Polish** (if needed):
   - Fix any issues found in testing
   - Update instructions in librechat.yaml
   - Add fallback strategies for demo

2. **Documentation**:
   - Create one-page handout for demo audience
   - Prepare FAQ for common questions
   - Document technical setup for reproducibility

3. **Decision on Steps 9-10**:
   - Go with Option A (skip) or Option B (mockups)?
   - If Option B, create slides/mockups

---

## 📊 SUMMARY

| Aspect | Status |
|--------|--------|
| **Core Demo (Steps 1-8)** | ✅ Ready (minor testing needed) |
| **Advanced Features (Steps 9-10)** | 🔴 Requires 3-4 months development |
| **HIVE API** | ✅ Running |
| **MCP Servers** | ✅ Configured |
| **Known Bugs** | ✅ Workarounds in place |
| **Evaluation Datasets** | ⚪ Not needed for demo |
| **Persona Use Cases** | ⚪ Moved to future work |

**Overall Assessment**: **READY FOR DEMO** (Steps 1-8)

**Recommended Approach**: Demo Steps 1-8 as working system, use slides for Steps 9-10 vision

**Timeline**: Can demo this week after 2-3 hours of testing

---

## 📞 Questions for Decision

1. **Demo Date**: When is the demo scheduled?
2. **Audience**: Who will see it? (Technical vs. executive)
3. **Format**: Live execution only, or live + slides?
4. **Steps 9-10**: Show as future vision, or omit entirely?
5. **Recording**: Should we record for wider distribution?

---

## 📁 Related Documentation

- [Demo-script-integrationsbericht_NEU.md](Demo-script-integrationsbericht_NEU.md) - Full NEU script
- [Demo-script-integrationsbericht.md](Demo-script-integrationsbericht.md) - Original script
- [HONEYCOMB-MCP-SETUP.md](HONEYCOMB-MCP-SETUP.md) - MCP configuration
- [LIBRECHAT-MCP-BUG-NESTED-OBJECTS.md](LIBRECHAT-MCP-BUG-NESTED-OBJECTS.md) - Known bug workaround
- [librechat.yaml](../../librechat.yaml) - Current configuration

---

**Last Updated**: 2025-10-14
**Status**: HIVE API running, ready for testing
**Next Review**: After first successful test run
