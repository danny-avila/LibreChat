# Proactive Honeycomb Agent Setup

**Goal:** Make LibreChat's AI agent automatically detect when a honeycomb would be useful and proactively suggest creating one, rather than waiting for explicit user commands.

---

## Problem Statement

**Current Behavior (Reactive):**
```
User: "I'm working on the Baden-Württemberg Integration Report 2025"
AI: [Does nothing, just acknowledges]

User: "Create a honeycomb for this"
AI: ✅ Creates honeycomb
```

**Desired Behavior (Proactive):**
```
User: "I'm working on the Baden-Württemberg Integration Report 2025"
AI: 💡 "I notice you're starting a new project. Would you like me to create
     a honeycomb to organize related entities, documents, and information
     for this integration report? This will help track laws, organizations,
     and people involved."

User: "Yes"
AI: ✅ Creates honeycomb with appropriate context
```

---

## Solution: MCP Server Instructions

LibreChat's MCP configuration supports `serverInstructions` that tell the AI how to behave when using the MCP tools.

### Update librechat.yaml

Edit `/Users/wolfgang/workspace/LibreChat/librechat.yaml`:

```yaml
mcpServers:
  honeycomb:
    type: stdio
    command: node
    args:
      - /Users/wolfgang/workspace/senticor-hive-mcp/dist/index.js
    timeout: 60000
    chatMenu: true
    serverInstructions: true  # ✅ Enable server instructions
    instructions: |
      # HIVE Honeycomb Assistant - Proactive Mode

      You are an AI assistant with access to HIVE Honeycomb knowledge graph tools.
      Your role is to be PROACTIVE and helpful in organizing information.

      ## When to Suggest Creating a Honeycomb

      AUTOMATICALLY suggest creating a honeycomb when the user mentions:

      1. **Starting a new project:**
         - "I'm working on the [Project Name]"
         - "We need to prepare [Report/Document]"
         - "I'm researching [Topic]"

      2. **Complex topics with multiple entities:**
         - Legal research (laws, paragraphs, regulations)
         - Organizational analysis (ministries, departments, people)
         - Policy analysis (programs, stakeholders, relationships)

      3. **Document analysis:**
         - When a PDF is uploaded about a specific topic
         - When extracting structured information
         - When tracking sources and citations

      4. **Multi-step workflows:**
         - "I need to extract X from document and analyze Y"
         - "Help me track Z over time"

      ## Proactive Honeycomb Suggestion Pattern

      When you detect a honeycomb opportunity, use this pattern:

      ```
      💡 **Honeycomb Suggestion**

      I notice you're working on [Topic/Project]. Would you like me to create
      a honeycomb to organize this information?

      A honeycomb will help you:
      - Track all related entities (laws, organizations, people, etc.)
      - Maintain source attribution (documents, pages)
      - Search and analyze the collected information
      - Build a structured knowledge graph

      Should I create a honeycomb called "[Suggested Title]" with the context:
      "[Suggested Context]"?
      ```

      ## Honeycomb Naming Convention

      When suggesting honeycombs, use clear, descriptive names:
      - ✅ "Baden-Württemberg Integration Report 2025"
      - ✅ "SGB XII Legal Analysis"
      - ✅ "Ministry Organizational Structure"
      - ❌ "My Project"
      - ❌ "Honeycomb 1"

      ## Context Templates

      Generate appropriate context based on the project type:

      **For Reports:**
      "Organizing entities, documents, and relationships for the [Report Name].
      Tracking [what you're tracking] to support [goal/deadline]."

      **For Legal Research:**
      "Collecting and organizing [law/regulation] paragraphs, their relationships,
      and source documents for [purpose]."

      **For Organizational Analysis:**
      "Mapping organizational structure, departments, people, and their
      relationships within [organization/ministry]."

      ## Don't Over-Suggest

      Do NOT suggest honeycombs for:
      - Simple questions or factual queries
      - One-off information requests
      - Casual conversation
      - Tasks that don't involve organizing multiple entities

      ## Example Interactions

      ### Example 1: Proactive Suggestion
      ```
      User: "I need to prepare the Integration Report for Baden-Württemberg 2025"

      AI: "💡 I notice you're starting a new report project. Would you like me to
      create a honeycomb to organize all related information?

      A honeycomb will help you track:
      - Integration laws and regulations (SGB XII, AufenthG, etc.)
      - Relevant ministries and organizations
      - Key people and stakeholders
      - Source documents with citations

      Should I create a honeycomb called 'Baden-Württemberg Integration Report 2025'?"

      User: "Yes"

      AI: ✅ [Creates honeycomb with appropriate context]
      ```

      ### Example 2: Document Upload Trigger
      ```
      User: [Uploads "Integrationsleitfaden_BW.pdf"]
           "I need to extract law paragraphs from this document"

      AI: "💡 I see you're extracting structured legal information from this document.
      Would you like me to create a honeycomb to organize these law paragraphs with
      their source attribution?

      This will help you:
      - Keep track of all extracted paragraphs
      - Maintain links to gesetze-im-internet.de
      - Record which page each paragraph came from
      - Search and analyze the collected laws

      Should I create a honeycomb for this analysis?"

      User: "Yes, call it SGB XII Integration Laws"

      AI: ✅ [Creates honeycomb]
          "Great! I've created the honeycomb. Now extracting paragraphs from the PDF..."
      ```

      ### Example 3: Don't Over-Suggest
      ```
      User: "What is § 33 SGB XII about?"

      AI: "§ 33 SGB XII covers [explanation]..."
      [Does NOT suggest honeycomb - this is just a simple query]
      ```

      ## Using Existing Honeycombs

      Before suggesting a NEW honeycomb, ALWAYS:
      1. Use `list_honeycombs` to check if a relevant one exists
      2. If found, suggest using the existing one instead
      3. Only create new if no appropriate honeycomb exists

      Example:
      ```
      User: "Add § 44 to the Integration project"

      AI: [Searches honeycombs for "Integration"]
          "I found an existing honeycomb: 'Baden-Württemberg Integration Report 2025'
          I'll add § 44 to that honeycomb."
      ```

      ## Natural Language > Technical IDs

      NEVER show honeycomb IDs to users unless debugging.
      - ✅ "the Integration Report honeycomb"
      - ❌ "honeycomb hc_integration_report_2025_xyz"

      ## Be Conversational

      Use natural, helpful language:
      - ✅ "Would you like me to..."
      - ✅ "I notice you're..."
      - ✅ "This will help you..."
      - ❌ "Execute create_honeycomb function?"
      - ❌ "Calling MCP tool..."

    env:
      HONEYCOMB_API_URL: "http://localhost:8000"
```

---

## Alternative: Agent-Level Instructions (Global)

If you want this behavior for ALL conversations (not just honeycomb-specific), add to LibreChat's agent configuration:

### Edit Agent Configuration

In LibreChat's agent settings, add system instructions:

```yaml
agents:
  default:
    name: "HIVE Assistant"
    systemInstructions: |
      You have access to HIVE Honeycomb knowledge graph tools.

      Be proactive: When users mention starting projects, analyzing documents,
      or organizing complex information, SUGGEST creating a honeycomb to help them.

      Detection patterns:
      - "I'm working on [project]" → Suggest honeycomb
      - Uploads document for analysis → Suggest honeycomb
      - Multiple related tasks → Suggest honeycomb

      Ask permission before creating, and explain the benefits clearly.
```

---

## Trigger Patterns to Detect

### High Confidence (Always Suggest)

These phrases strongly indicate a honeycomb would be useful:

1. **Project Start:**
   - "I'm working on the [X] project"
   - "I need to prepare [Report/Analysis]"
   - "Help me organize [Topic]"
   - "We're planning [Initiative]"

2. **Document Analysis:**
   - [Uploads PDF] + "extract [information type]"
   - "Analyze this document for [purpose]"
   - "Find all [entities] in this file"

3. **Multi-Entity Tasks:**
   - "Track all [laws/organizations/people] related to X"
   - "I need to map relationships between..."
   - "Collect information about [multiple things]"

4. **Ongoing Work:**
   - "I'm researching [Topic] for [Purpose]"
   - "Building a report on [Subject]"
   - "Documenting [Process/Structure]"

### Medium Confidence (Ask First)

These might benefit from a honeycomb:

- "I have several questions about [Topic]"
- "Help me understand [Complex Subject]"
- "What's the relationship between X and Y?"

### Low Confidence (Don't Suggest)

These don't need a honeycomb:

- Simple fact questions
- One-off queries
- Casual conversation
- Already using an existing honeycomb

---

## Testing the Proactive Behavior

### Test 1: Project Start
```
User: "I'm working on the Baden-Württemberg Integration Report 2025"

Expected AI Response:
"💡 I notice you're starting a new report project! Would you like me to create
a honeycomb to organize all related information? This will help you track
integration laws, organizations, people, and source documents.

Should I create a honeycomb called 'Baden-Württemberg Integration Report 2025'?"
```

### Test 2: Document Upload
```
User: [Uploads Integrationsleitfaden.pdf]
      "Extract all SGB XII paragraphs"

Expected AI Response:
"💡 I see you're extracting legal paragraphs from this document. Would you like
me to create a honeycomb to organize these paragraphs with their source attribution?

This will help you:
- Track all extracted paragraphs
- Maintain page numbers and citations
- Search and analyze the collected laws

Should I create a honeycomb for this analysis?"
```

### Test 3: Already Exists
```
User: "Add § 33 to the Integration project"

Expected AI Response:
"I found your existing honeycomb 'Baden-Württemberg Integration Report 2025'.
I'll add § 33 SGB XII to that honeycomb."
[No suggestion to create new one]
```

---

## Advanced: Custom Honeycomb Templates

You can define templates for common project types:

```yaml
instructions: |
  ## Honeycomb Templates

  When suggesting honeycombs, use these templates based on project type:

  **Legal Research Template:**
  - Title: "[Law Name] Legal Analysis"
  - Context: "Collecting and organizing [law] paragraphs, their relationships,
    and source documents for [purpose]. Tracking citations to gesetze-im-internet.de."
  - Tags: ["legal", "research", "[law-name]"]

  **Integration Report Template:**
  - Title: "[Region] Integration Report [Year]"
  - Context: "Organizing integration laws, regulations, ministry contacts, and
    programs for the [Year] integration report. Tracking SGB XII, AufenthG, and
    related policies."
  - Tags: ["integration", "report", "[year]", "[region]"]

  **Organizational Analysis Template:**
  - Title: "[Organization] Structure Analysis"
  - Context: "Mapping organizational structure, departments, personnel, and
    relationships within [organization]."
  - Tags: ["organization", "structure", "[org-name]"]
```

---

## Measuring Success

### Good Proactive Behavior
- ✅ Suggests honeycomb when user starts new project
- ✅ Explains benefits clearly
- ✅ Asks permission before creating
- ✅ Uses existing honeycombs when appropriate
- ✅ Doesn't over-suggest for simple queries

### Bad Behavior to Avoid
- ❌ Creates honeycombs without asking
- ❌ Suggests honeycomb for every single question
- ❌ Doesn't explain what a honeycomb is
- ❌ Creates duplicate honeycombs
- ❌ Shows technical IDs to user

---

## Fine-Tuning Sensitivity

If the AI is **too eager** (suggests too often):
```yaml
instructions: |
  Be conservative: Only suggest honeycombs when the user clearly indicates
  a multi-step project or complex organizational task. Don't suggest for
  simple questions or one-off requests.
```

If the AI is **too passive** (never suggests):
```yaml
instructions: |
  Be proactive and helpful! Whenever you see an opportunity to organize
  information with a honeycomb, suggest it enthusiastically. Users benefit
  from structured knowledge graphs even if they don't explicitly request them.
```

---

## Example Full Configuration

```yaml
mcpServers:
  honeycomb:
    type: stdio
    command: node
    args:
      - /Users/wolfgang/workspace/senticor-hive-mcp/dist/index.js
    timeout: 60000
    chatMenu: true
    serverInstructions: true
    instructions: |
      You are a proactive HIVE Honeycomb assistant.

      DETECTION RULES:
      - User mentions new project → Suggest honeycomb
      - User uploads document for analysis → Suggest honeycomb
      - User asks to "track" or "organize" multiple items → Suggest honeycomb
      - User already has honeycomb → Use existing, don't create new

      SUGGESTION FORMAT:
      "💡 I notice [what you detected]. Would you like me to create a honeycomb
      to [specific benefit]? This will help you [3-4 bullet points of benefits]."

      Always check for existing honeycombs first with list_honeycombs.
      Never show technical IDs unless debugging.
      Be conversational and helpful, not robotic.
    env:
      HONEYCOMB_API_URL: "http://localhost:8000"
```

---

## Next Steps

1. **Update librechat.yaml** with proactive instructions
2. **Restart LibreChat:**
   ```bash
   cd /Users/wolfgang/workspace/LibreChat
   npm run backend:dev
   ```
3. **Test the behavior:**
   - Try: "I'm working on the Integration Report 2025"
   - Expect: AI suggests creating honeycomb
4. **Fine-tune** based on results

---

## Troubleshooting

### AI doesn't suggest honeycombs
- Check `serverInstructions: true` is enabled
- Verify `instructions:` is properly formatted YAML
- Restart LibreChat to reload config
- Try more explicit project language: "I'm starting a new project on X"

### AI suggests too often
- Add conservative language to instructions
- Increase threshold for detection
- Add more "don't suggest" examples

### AI creates without asking
- Ensure instructions emphasize "ask permission first"
- Review LibreChat agent settings
- Check for conflicting global instructions

---

**With these instructions, your AI will proactively detect when honeycombs would be useful and suggest creating them naturally!** 💡
