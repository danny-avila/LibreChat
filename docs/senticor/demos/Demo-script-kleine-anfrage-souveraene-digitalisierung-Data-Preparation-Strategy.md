# Demo Data Preparation Strategy: Kleine Anfrage - Digitale Souveränität

**Demo**: Kleine Anfrage aus dem Bundestag beantworten
**Topic**: Souveräne Digitalisierungsprojekte (Delos, OpenDesk, Smart Cities)
**Duration**: 8-10 minutes
**Date Created**: 2025-10-29

---

## Executive Summary

**Scenario**: A ministry worker receives a Kleine Anfrage about the status of sovereign digitalization projects in German municipalities (OpenDesk, Delos, Smart Cities funding program).

**Key Insight**: We use **real, publicly available data** that would be difficult to structure and analyze without Hive. The demo shows how LibreChat + Hive transforms scattered public information into queryable knowledge.

**Data Strategy**: **Hybrid approach** - Preseed core structure + demonstrate live web scraping during demo to show the knowledge graph building process.

---

## Why This Topic Works

### 1. **Real & Relevant**
- OpenDesk officially launched October 2024 (very current!)
- Delos Cloud contracts signed September 2024
- Smart Cities program: 73 municipalities, €820M funding (2019-2024)
- Active parliamentary interest (actual Drucksache 20/15138 from March 2025 exists)

### 2. **Complex & Scattered Data**
Perfect for demonstrating Hive's value:
- **Multiple programs**: OpenDesk, Delos, Smart Cities, Digitale Zukunftskommune@bw
- **Multiple levels**: Federal, state (16 Bundesländer), municipal (73+ cities)
- **Multiple sources**: Bundestag documents, ministry websites, project pages, press releases
- **Relationships matter**: Which municipalities use what? Which states participate? How are programs connected?

### 3. **Hard Without Knowledge Graph**
Traditional approach would require:
- Manually tracking 73+ Smart Cities projects across documents
- Excel spreadsheets for federal states and their participation
- Word documents with copy-pasted quotes
- No way to query: "Which municipalities use OpenDesk AND received Smart Cities funding?"

---

## Real Data Sources (Publicly Available)

### A. Smart Cities Modellprojekte (Federal Program)

**Program Overview**:
- **73 municipalities** funded across 3 rounds (2019-2021)
- **€820 million** total funding
- **Duration**: 7 years per project (still running in 2024)

**Round 1 (2019)**: 13 projects
**Round 2 (2020)**: 32 projects (€350M)
- Examples: Hamburg, Leipzig, München (joint project), Jena, Gelsenkirchen

**Round 3 (2021)**: 28 projects (€300M)
- **Cities**: Bochum, Detmold, Dresden, Einbeck, Guben, Halle (Saale), Hannover, Hildesheim, Kempten (Allgäu), Konstanz, Linz am Rhein, Mühlhausen/Thüringen, Münster, Oberhausen, Pforzheim, Potsdam, Regensburg, Wuppertal, Würzburg
- **Districts (Landkreise)**: Gießen, Hameln-Pyrmont, Höxter, Kusel, Schleswig-Flensburg, Vorpommern-Greifswald
- **Other**: Ringelai (municipality), Metropolregion Rhine-Neckar

**Source**: https://www.smart-city-dialog.de/ueber-uns/modellprojekte-smart-cities

**Data We Can Scrape**:
- Municipality names and types (city, district, region)
- Funding round
- Project descriptions (from individual project pages)
- Status updates

---

### B. OpenDesk Adoption (Sovereign Workspace)

**Program Overview**:
- **Launch**: October 2024 (market launch)
- **Goal**: Sovereign alternative to Microsoft 365 for public administration
- **Managed by**: ZenDiS (Zentrum für Digitale Souveränität)

**Known Adopters (Public Information)**:

**Federal Level**:
- Robert Koch Institute (RKI) - Agora platform
- Bundesamt für Seeschifffahrt und Hydrographie (BSH)
- BWI GmbH (pilot user)

**State Level (Bundesländer)**:
- **Baden-Württemberg**: ~60,000 workstations (Digitaler Arbeitsplatz für Lehrer - DAP)
- **Schleswig-Holstein**: Most advanced, preparations complete
- **Thüringen**: Shareholder agreement signed, ready to join
- **6 additional states** in pilot phase (names not publicly specified)

**Municipal Level**:
- Kommunale Datenverarbeitung Oldenburg (KDO) - IT service provider
- Various unnamed municipalities in pilot phase

**Source**:
- https://www.zendis.de
- https://kommunalwiki.boell.de/index.php/OpenDesk
- Various press releases

**Data We Can Scrape**:
- Organization names
- Adoption status (pilot/production)
- Number of workstations (where available)
- Timeline information

---

### C. Delos Cloud (Sovereign Cloud Infrastructure)

**Program Overview**:
- **Launch Timeline**: First services Q1 2025, mainstream services Q2 2025
- **Partnership**: Delos Cloud GmbH + Microsoft + Arvato Systems
- **Goal**: BSI-compliant sovereign hyperscale cloud for public sector

**Known Information**:
- Contracts signed September 2024
- Target customers: Federal, state, municipal administration
- Requirement: BSI Cloud Platform Requirements compliance
- Services: Azure Foundational Services, Azure Mainstream Services, Microsoft 365

**Source**:
- https://www.deloscloud.de
- https://news.microsoft.com/de-de/erste-souveraene-cloud-plattform-fuer-die-deutsche-verwaltung-auf-der-zielgeraden/

**Data We Can Scrape**:
- Timeline milestones
- Partner organizations
- Service offerings
- Compliance requirements

---

### D. State Programs: Digitale Zukunftskommune@bw

**Program Overview** (Baden-Württemberg example):
- **55 municipalities** selected in 2018
- **€7.6 million** total funding
- **Phases**: Strategy development (€45k) → Implementation (€100k) → Full implementation (€880k)

**Top Tier (€880,000 each over 2-3 years)**:
- Karlsruhe (Stadt)
- Ludwigsburg (Stadt)
- Heidelberg (Stadt)
- Ulm (Stadt)
- Consortium: Landkreise Karlsruhe, Biberach, Böblingen, Konstanz, Tuttlingen

**Phase 2 Winners (€100,000 each)**:
- Herrenberg, Ravensburg, Winnenden, Stutensee, Schönau im Odenwald
- Zollernalbkreis, Landkreis Tuttlingen, Regionalverband Nordschwarzwald
- RegioENERGIE consortium

**Phase 1 Participants (€45,000 each)**: 30+ municipalities and districts

**Source**: https://www.gemeindetag-bw.de/internet/themen/gemeindetag-ber%C3%A4t-kommunen-beim-ideenwettbewerb-digitale-zukunftskommunebw

**Data We Can Scrape**:
- Municipality/district names
- Funding tier
- Consortium memberships
- Project descriptions

---

### E. Bundestag Documents (Kleine Anfragen)

**Real Example**:
- **Drucksache 20/15138** (March 21, 2025)
- **Topic**: "Digitale Souveränität und Nutzung von Open Source bei Clouds der Bundesverwaltung"
- **Asked by**: Die Linke party
- **Answered by**: Federal Government

**Format Structure** (from research):
- Header: "Deutscher Bundestag" + Drucksache number + Wahlperiode + Date
- "Antwort der Bundesregierung"
- "auf die Kleine Anfrage der Abgeordneten [names] und der Fraktion [party]"
- "Drucksache [question document number]"
- Questions repeated in smaller font
- Answers numbered (Zu Frage 1:, Zu Frage 2:, etc.)
- Often includes tables for statistics
- Sources cited at end or in footnotes
- Format: Professional, formal, structured

**Source**: https://dserver.bundestag.de/btd/20/151/2015138.pdf

---

## Data Preparation Strategy

### Recommended Approach: **Hybrid - Preseed Structure + Live Demo Build**

**Why Hybrid?**
1. **Time constraint**: 8-10 minutes doesn't allow building from scratch
2. **Demo impact**: Showing live knowledge graph building is impressive
3. **Realism**: Real workflows involve both existing knowledge and new research

---

### Phase 1: Preseed (Before Demo)

**Create Honeycomb**: `Souveraene_Digitalisierung_Kommunen_2024`

**Preseed the following entities** (~100 entities):

#### 1. Core Programs (4 entities)
```
- Smart Cities Modellprojekte (Federal)
  - Funding: €820M
  - Timeline: 2019-2026
  - Municipalities: 73
  - Source: BMWSB

- OpenDesk (ZenDiS)
  - Launch: Oct 2024
  - Type: Sovereign workspace
  - Alternative to: Microsoft 365
  - Source: zendis.de

- Delos Cloud
  - Launch: Q1-Q2 2025
  - Type: Sovereign cloud infrastructure
  - Partners: Delos, Microsoft, Arvato
  - Source: deloscloud.de

- Digitale Zukunftskommune@bw (State)
  - Funding: €7.6M
  - State: Baden-Württemberg
  - Municipalities: 55
  - Source: Ministerium für Inneres BW
```

#### 2. Key Stakeholders (6 entities)
```
- Bundestag (Parliament)
- Bundesministerium für Wohnen, Stadtentwicklung und Bauwesen (BMWSB)
- ZenDiS (Zentrum für Digitale Souveränität)
- Ministerium für Inneres, Digitalisierung und Kommunen Baden-Württemberg
- IT-Planungsrat
- BSI (Bundesamt für Sicherheit in der Informationstechnik)
```

#### 3. Sample Municipalities (20 entities)
Select diverse examples:
- **Large cities**: Hamburg, München, Leipzig, Dresden, Köln
- **Medium cities**: Potsdam, Jena, Heidelberg, Karlsruhe, Ulm
- **Small cities**: Guben, Einbeck, Ringelai
- **Districts**: Vorpommern-Greifswald, Zollernalbkreis, Höxter
- **Consortia**: Metropolregion Rhine-Neckar, RegioENERGIE

#### 4. Bundesländer (16 entities)
All 16 German states with basic info

#### 5. Legal/Policy Framework (5 entities)
```
- OZG (Onlinezugangsgesetz)
- IT-Grundschutz (BSI)
- Cloud Platform Requirements (BSI)
- Digitalisierungsstrategie Deutschland
- Smart City Charta
```

#### 6. Key Relationships (Edges)
```
- Municipality → participates_in → Program
- Municipality → located_in → Bundesland
- Municipality → receives_funding → Amount
- Program → managed_by → Stakeholder
- Program → funded_by → Ministry
- Program → based_on_regulation → Legal Framework
- Organization → uses → OpenDesk
- Organization → type → (Stadt/Landkreis/Bund/Land)
```

**Total Preseeded**: ~60 entities + ~150 edges

---

### Phase 2: Live Demo - Build Knowledge Graph

**During demo, use Tavily/Fetch to add**:

#### Scenario A: Simple Query Enhancement (2-3 minutes)
**User asks**: "Welche Smart Cities Projekte gibt es in Baden-Württemberg?"

**LibreChat**:
1. Searches existing graph → finds some municipalities
2. **Proactively suggests**: "Ich finde 5 Projekte im Graphen. Soll ich aktuelle Informationen von der Smart Cities Website holen?"
3. **Uses fetch**: `https://www.smart-city-dialog.de/ueber-uns/modellprojekte-smart-cities`
4. **Extracts**: More municipalities, project descriptions, status updates
5. **Adds to graph**: New municipality nodes + project descriptions + source URLs

**Show in Hive UI**: New nodes appearing, edges created, source metadata

---

#### Scenario B: Cross-Program Analysis (3-4 minutes)
**User asks**: "Welche Kommunen nutzen sowohl OpenDesk als auch haben Smart Cities Förderung erhalten?"

**LibreChat**:
1. Queries graph → finds overlap (e.g., Potsdam)
2. **Notices gaps**: "Ich habe nur begrenzte Informationen über OpenDesk-Nutzer. Soll ich nach aktuellen Informationen suchen?"
3. **Uses fetch**: ZenDiS website, OpenDesk pilot announcements
4. **Extracts**: Baden-Württemberg state adoption, pilot users
5. **Adds to graph**: Adoption entities, relationships
6. **Generates answer**: "Folgende Kommunen nutzen beide Programme: [list]"

**Show in Hive UI**:
- How query traverses edges
- How new data enriches existing entities
- How sources are tracked

---

#### Scenario C: Prepare Kleine Anfrage Response (3-4 minutes)
**User asks**: "Erstelle eine Antwort auf diese Kleine Anfrage: Wie viele Kommunen haben souveräne Digitalisierungslösungen im Einsatz? Aufschlüsselung nach Bundesländern."

**LibreChat**:
1. Queries graph → aggregates data
2. **Identifies need for format**: "Ich brauche das offizielle Format für Kleine Anfrage Antworten. Soll ich ein Beispiel abrufen?"
3. **Uses fetch**: Bundestag Drucksache example (or preseed format guide)
4. **Adds to graph**: Format requirements, structure templates
5. **Generates draft response**:
   - Correct header format
   - Numbered answers
   - Table with Bundesland breakdown
   - Sources cited
6. **All claims traceable** to graph nodes

**Show in Hive UI**:
- How statistics are calculated (aggregate queries)
- How sources support each claim
- How format template is stored and reused

---

### Phase 3: Verification in Hive UI (2-3 minutes)

**Demonstrate**:

1. **Graph Visualization**
   - Show program nodes (green)
   - Show municipality nodes (blue)
   - Show state nodes (yellow)
   - Show organization nodes (purple)
   - Show relationship edges

2. **Entity Details**
   - Click on "Potsdam" node → show properties:
     ```
     Name: Potsdam
     Type: Stadt
     Bundesland: Brandenburg
     Population: ~180,000
     Smart_Cities_Round: 3
     Smart_Cities_Funding: [amount if available]
     Uses_OpenDesk: true
     Source_URLs: [list]
     Last_Updated: 2024-10-29
     ```

3. **Relationship Traversal**
   - From "Potsdam" → "participates_in" → "Smart Cities Modellprojekte"
   - From "Potsdam" → "located_in" → "Brandenburg"
   - From "Potsdam" → "uses" → "OpenDesk"

4. **Source Provenance**
   - Show source nodes with URLs
   - Show timestamps (when data was fetched)
   - Show which claims are supported by which sources

5. **Aggregation Example**
   - Filter: All municipalities with `Smart_Cities_Funding > 0`
   - Group by: Bundesland
   - Count: Show distribution across states

---

## Technical Implementation

### A. Preseed Data Format (JSON/YAML)

**Example entity structure**:
```json
{
  "id": "potsdam",
  "type": "Kommune",
  "name": "Potsdam",
  "properties": {
    "official_name": "Landeshauptstadt Potsdam",
    "type": "Stadt",
    "bundesland": "Brandenburg",
    "population": 180000,
    "website": "https://www.potsdam.de"
  },
  "tags": ["Smart_City", "Modellkommune", "Brandenburg"],
  "sources": [
    {
      "url": "https://www.smart-city-dialog.de/potsdam",
      "date": "2024-10-29",
      "type": "official_program_page"
    }
  ]
}
```

### B. MCP Server Setup

**Required MCP Servers**:
1. **honeycomb** - Knowledge graph (already configured)
2. **fetch** (or **Tavily MCP**) - Web scraping
3. **deutsche-gesetze** (optional) - For legal framework references

**Configuration in librechat.yaml**:
```yaml
mcpServers:
  honeycomb:
    command: uvx
    args: ["honeycomb-mcp"]
    env:
      HIVE_URL: "http://host.containers.internal:8000"
    serverInstructions: |
      Use this to manage the knowledge graph for sovereign digitalization projects.
      Always include source URLs and timestamps.

  fetch:
    command: uvx
    args: ["mcp-server-fetch"]
    serverInstructions: |
      Use this to fetch information from official websites:
      - Smart Cities program pages
      - OpenDesk/ZenDiS announcements
      - Bundestag documents
      Always process the content and extract structured data for the knowledge graph.
```

### C. Agent Instructions

**Add to Agent system prompt**:
```
# Souveräne Digitalisierung Demo Instructions

## Context
You are assisting with a Bundestag parliamentary inquiry (Kleine Anfrage) about
sovereign digitalization projects in German municipalities.

## Knowledge Graph
Use the "Souveraene_Digitalisierung_Kommunen_2024" Honeycomb for all queries.

## Proactive Behavior
1. If data seems incomplete, OFFER to fetch current information from official sources
2. When generating statistics, ALWAYS trace back to source nodes in the graph
3. For Kleine Anfrage responses, use the official format stored in the graph

## Key Programs to Track
- Smart Cities Modellprojekte (Federal, 73 municipalities, €820M)
- OpenDesk (Sovereign workspace, ZenDiS)
- Delos Cloud (Sovereign cloud infrastructure)
- State programs (e.g., Digitale Zukunftskommune@bw)

## Data Quality
- Always include source URLs
- Always include date fetched
- Mark data as "verified" only if from official government sources

## When to Fetch New Data
- User asks for "aktuelle" or "neueste" information
- Graph data is >30 days old
- User asks about specific municipalities not in graph
- User asks for cross-program analysis and data seems incomplete

## Response Format
For statistical questions:
1. Query the graph
2. Present aggregated data with sources
3. Offer to generate formal Kleine Anfrage response if appropriate

For entity questions:
1. Return structured information
2. Include all relationships
3. Show source provenance
4. Offer to enrich data if needed
```

---

## Demo Script Prompts (Copy-Paste Ready)

### Setup Prompt (before starting)
```
Ich arbeite an einer Kleinen Anfrage aus dem Bundestag zum Thema "Digitale Souveränität
in deutschen Kommunen". Bitte nutze den Wissensgraphen "Souveraene_Digitalisierung_Kommunen_2024"
für alle Anfragen und biete proaktiv an, fehlende Informationen von offiziellen Websites
abzurufen.
```

### Prompt 1: Initial Query
```
Welche Smart Cities Modellprojekte gibt es in Baden-Württemberg, und haben diese Kommunen
auch andere souveräne Digitalisierungslösungen wie OpenDesk im Einsatz?
```

### Prompt 2: Accept Web Fetch Offer
```
Ja bitte, hole aktuelle Informationen von der offiziellen Smart Cities Website und
füge sie dem Wissensgraphen hinzu.
```

### Prompt 3: Cross-Program Analysis
```
Zeige mir eine Übersicht: Welche Bundesländer haben die meisten Kommunen mit
Smart Cities Förderung? Gibt es Korrelationen mit OpenDesk-Nutzung oder
Digitale Zukunftskommune Projekten?
```

### Prompt 4: Generate Kleine Anfrage Response
```
Erstelle eine Antwort auf diese Kleine Anfrage:

"Wie viele deutsche Kommunen haben im Jahr 2024 Förderung für souveräne
Digitalisierungsprojekte erhalten? Bitte aufgeschlüsselt nach:
1. Bundesprogramm (Smart Cities)
2. Landesprogrammen (z.B. Digitale Zukunftskommune@bw)
3. Bundesländern
4. Mit Angabe der Fördersummen

Welche Kommunen nutzen souveräne Lösungen wie OpenDesk? Wie ist der aktuelle
Stand bei Delos Cloud?"

Nutze das offizielle Bundestag-Format für die Antwort und füge alle Quellenangaben hinzu.
```

### Prompt 5: Verify in Hive
```
Zeige mir die vollständige Struktur des Wissensgraphen mit allen Quellen und
dem letzten Aktualisierungsdatum.
```

---

## Data Preparation Checklist

### Before Demo (1-2 hours prep time)

- [ ] Create Honeycomb: `Souveraene_Digitalisierung_Kommunen_2024`
- [ ] Preseed 60+ entities:
  - [ ] 4 core programs
  - [ ] 6 stakeholder organizations
  - [ ] 20 sample municipalities
  - [ ] 16 Bundesländer
  - [ ] 5 legal/policy frameworks
  - [ ] ~10 adopter organizations (OpenDesk users)
- [ ] Create ~150 relationship edges
- [ ] Add source metadata (URLs, dates) to all entities
- [ ] Prepare Kleine Anfrage format template entity
- [ ] Test Hive UI accessibility (localhost:8000)
- [ ] Test LibreChat connection to Honeycomb MCP
- [ ] Test fetch/Tavily MCP server
- [ ] Dry run: Test all demo prompts

### URLs to Preseed as Sources

```
# Federal Programs
https://www.smart-city-dialog.de/ueber-uns/modellprojekte-smart-cities
https://www.bmwsb.bund.de/Webs/BMWSB/DE/themen/stadt-wohnen/staedtebau/smart-cities/smart-cities-node.html

# OpenDesk / ZenDiS
https://www.zendis.de
https://kommunalwiki.boell.de/index.php/OpenDesk

# Delos Cloud
https://www.deloscloud.de
https://news.microsoft.com/de-de/erste-souveraene-cloud-plattform-fuer-die-deutsche-verwaltung-auf-der-zielgeraden/

# State Programs
https://www.gemeindetag-bw.de/internet/themen/gemeindetag-ber%C3%A4t-kommunen-beim-ideenwettbewerb-digitale-zukunftskommunebw
https://im.baden-wuerttemberg.de/de/digitalisierung/digitale-zukunftskommune-bw

# Bundestag
https://dip.bundestag.de
https://www.bundestag.de/services/glossar/glossar/K/kleine_anfrage-245476
```

---

## Why This Data Preparation Strategy Works

### 1. **Authenticity**
- All data is real and publicly available
- Demonstrable sources (URLs work, can be checked)
- Current and relevant (2024 data, ongoing programs)

### 2. **Complexity**
- 100+ entities across multiple programs
- 16 states, 73+ municipalities, multiple programs
- Real relationships that matter (program participation, geographic location, adoption status)
- Statistical aggregation challenges (count by state, compare programs)

### 3. **Demo Impact**
- **Preseed provides structure** → demo starts fast
- **Live fetch shows intelligence** → AI proactively enriches data
- **Hive UI shows transparency** → every claim is verifiable
- **Format generation impresses** → correct Bundestag format automatically

### 4. **Scalability Story**
- Demo shows 20-30 municipalities
- Easy to explain: "This works for all 73 Smart Cities + 11,000 German municipalities"
- Same approach for any parliamentary inquiry topic
- Graph structure supports adding more programs/states/data over time

### 5. **Practical Value**
- Real pain point: Kleine Anfragen require fast, accurate, sourced responses
- Traditional approach: Days of manual research and Excel work
- With Hive: Minutes, with full audit trail and source verification
- Immediate understanding: "This saves days of work"

---

## Alternative: If Preseed is Not Possible

**Pure Live Demo** (higher risk, but more impressive if it works):

1. **Start with empty Honeycomb** (or just program definitions)
2. **First prompt**: "Ich brauche Informationen über Smart Cities Modellprojekte in Deutschland für eine Kleine Anfrage"
3. **LibreChat proactively**: "Ich erstelle einen Wissensgraphen und hole Informationen von der offiziellen Website"
4. **Live fetch + build**: Shows entire graph being built from scratch
5. **Continue with queries**: Each query might trigger additional fetches

**Pro**:
- Maximum "wow factor" - building knowledge from zero
- Shows full workflow from empty to complete

**Con**:
- Takes longer (10-15 minutes)
- Higher risk of errors or incomplete data
- Harder to ensure demo flows smoothly

**Recommendation**: Only do pure live demo if you have 15+ minutes and very reliable fetch/MCP setup.

---

## Questions for Finalization

1. **Duration**: Confirm 8-10 minutes is the target? Or can we extend to 12-15 if needed?

2. **Preseed depth**: Should we preseed more (80+ entities) or fewer (40 entities) for demo stability?

3. **Live fetch emphasis**: How much time should we spend showing the live fetch process vs. querying existing data?

4. **Hive UI detail**: Should we show technical details (node properties, edge types) or keep it high-level visual?

5. **Bundestag format**: Should we preseed the format template or fetch it live from a real Drucksache?

6. **Backup plan**: Should we have a fully-preseeded "backup honeycomb" in case live fetch fails during demo?

---

## Next Steps

1. **Confirm data strategy** (hybrid preseed + live vs. fully preseeded vs. fully live)
2. **Create preseed script** (Python/TypeScript to populate Honeycomb via API)
3. **Write full demo script** with exact prompts and expected responses
4. **Test end-to-end** with actual LibreChat + Hive setup
5. **Create fallback materials** (screenshots, backup data) in case of technical issues

**Estimated prep time**: 4-6 hours (preseed creation + testing)

---

**Document Status**: Draft for review
**Next Review**: After strategy confirmation
**Owner**: Wolfgang + Claude
