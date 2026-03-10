---
phase: 1
slug: legacy-tool-migration
status: draft
nyquist_compliant: true
wave_0_complete: false
wave_0_planned: true
created: 2026-03-10
---

# Phase 1 -- Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest + React Testing Library (jsdom) |
| **Config file** | `client/jest.config.cjs` |
| **Quick run command** | `cd client && npx jest --testPathPattern="Content/__tests__" --no-coverage -x` |
| **Full suite command** | `cd client && npx jest --no-coverage` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd client && npx jest --testPathPattern="Content/__tests__" --no-coverage -x`
- **After every plan wave:** Run `cd client && npx jest --no-coverage`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Wave 0 Plan

Wave 0 is addressed by **01-00-PLAN.md** which creates both test stub files before any implementation begins.

- [ ] `client/src/components/Chat/Messages/Content/__tests__/ImageGen.test.tsx` -- stubs for LGCY-01, LGCY-03
- [ ] `client/src/components/Chat/Messages/Content/__tests__/RetrievalCall.test.tsx` -- stubs for LGCY-02, LGCY-03
- [ ] Existing `ToolCall.test.tsx` pattern serves as test template (mock structure, RecoilRoot wrapping)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 01-00-01 | 00 | 0 | LGCY-01, LGCY-03 | stub | `cd client && npx jest --testPathPattern="__tests__/ImageGen" --no-coverage` | Created by W0 | pending |
| 01-00-02 | 00 | 0 | LGCY-02, LGCY-03 | stub | `cd client && npx jest --testPathPattern="__tests__/RetrievalCall" --no-coverage` | Created by W0 | pending |
| 01-01-01 | 01 | 1 | LGCY-01, LGCY-03 | unit | `cd client && npx jest --testPathPattern="__tests__/ImageGen" --no-coverage -x` | Depends on W0 | pending |
| 01-01-02 | 01 | 1 | LGCY-01 | unit | `cd client && npx jest --testPathPattern="__tests__/ImageGen" --no-coverage -x` | Depends on W0 | pending |
| 01-02-01 | 02 | 2 | LGCY-02, LGCY-03 | unit | `cd client && npx jest --testPathPattern="__tests__/RetrievalCall" --no-coverage -x` | Depends on W0 | pending |
| 01-02-02 | 02 | 2 | LGCY-02 | unit | `cd client && npx jest --testPathPattern="__tests__/RetrievalCall" --no-coverage -x` | Depends on W0 | pending |

*Status: pending / green / red / flaky*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| All three render contexts work (streaming, completed, history) | LGCY-01, LGCY-02 | Visual verification requires browser rendering | Use playwright-pro to verify each render context in both light and dark mode |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify with behavioral test commands
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covered by 01-00-PLAN.md (creates test stubs before implementation)
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending execution of Wave 0
