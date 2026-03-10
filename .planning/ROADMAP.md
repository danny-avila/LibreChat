# Roadmap: LibreChat Tool System UI

## Overview

This project brings all tool UIs in LibreChat to visual and behavioral parity. The already-improved tools (MCP calls, code execution, web search, Mermaid) set the standard. Phase 1 migrates the legacy tools (ImageGen, RetrievalCall) to that standard. Phase 2 applies the same patterns to Actions and Store tools -- the highest-value user-facing work. Phase 3 sweeps across all tool UIs to ensure consistent accessibility (semantic HTML, ARIA, keyboard navigation, screen reader support).

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Legacy Tool Migration** - Migrate ImageGen and RetrievalCall to modern patterns with localized strings
- [ ] **Phase 2: Actions and Store Tools** - Modernize Actions and Store tool UIs with consistent containers and collapsible output
- [ ] **Phase 3: Accessibility Audit** - Ensure all tool UIs use semantic HTML, ARIA attributes, keyboard nav, and screen reader support

## Phase Details

### Phase 1: Legacy Tool Migration
**Goal**: Legacy tools (ImageGen, RetrievalCall) are visually indistinguishable from the already-improved tools
**Depends on**: Nothing (first phase)
**Requirements**: LGCY-01, LGCY-02, LGCY-03
**Success Criteria** (what must be TRUE):
  1. ImageGen tool calls render with the same container styling, progress indicators, and status states as MCP tool calls
  2. RetrievalCall tool calls render with semantic Tailwind tokens and consistent container chrome matching other tool types
  3. All user-facing strings in legacy tool components use `useLocalize()` with English translation keys -- no hardcoded English text remains
  4. Legacy tools display correctly in all three render contexts: streaming, completed message, and conversation history reload
**Plans**: 3 plans

Plans:
- [ ] 01-00-PLAN.md -- Create test stubs for ImageGen and RetrievalCall (Wave 0, LGCY-01, LGCY-02, LGCY-03)
- [ ] 01-01-PLAN.md -- Merge ImageGen components and update Part.tsx dispatch (LGCY-01, LGCY-03)
- [ ] 01-02-PLAN.md -- Modernize RetrievalCall with collapsible panel and localized text (LGCY-02, LGCY-03)

### Phase 2: Actions and Store Tools
**Goal**: Actions and Store tools look and behave like first-class tool types with consistent chrome, output formatting, and collapsible panels
**Depends on**: Phase 1
**Requirements**: ACTN-01, ACTN-02, ACTN-03
**Success Criteria** (what must be TRUE):
  1. Actions tool calls render with the same container styling, progress indicators, and ToolIcon treatment as MCP tool calls
  2. Store tools (image generators) render with consistent container chrome around their specialized content (image display, PixelCard)
  3. Both Actions and Store tools have collapsible output panels that expand/collapse with the same animation and keyboard interaction as existing tool detail panels
  4. Actions display parameters using the same key-value formatting used by MCP tool calls
  5. Tool output in Actions and Store tools uses OutputRenderer for smart JSON formatting
**Plans**: TBD

Plans:
- [ ] 02-01: TBD
- [ ] 02-02: TBD

### Phase 3: Accessibility Audit
**Goal**: Every tool UI in the application is fully keyboard and screen reader accessible with semantic HTML
**Depends on**: Phase 2
**Requirements**: A11Y-01, A11Y-02, A11Y-03, A11Y-04
**Success Criteria** (what must be TRUE):
  1. No `div` or `span` elements with click handlers remain in tool UI components -- all interactive elements use `button`, `a`, or other semantic HTML elements
  2. All interactive tool UI elements have appropriate `aria-label`, `role`, or `aria-describedby` attributes
  3. A user can navigate through all tool UI elements (expand/collapse, copy, view output) using only the keyboard with visible focus indicators
  4. Screen readers announce tool status changes (running, completed, failed, cancelled) and tool output content meaningfully
**Plans**: TBD

Plans:
- [ ] 03-01: TBD
- [ ] 03-02: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Legacy Tool Migration | 0/3 | Planning complete | - |
| 2. Actions and Store Tools | 0/0 | Not started | - |
| 3. Accessibility Audit | 0/0 | Not started | - |
