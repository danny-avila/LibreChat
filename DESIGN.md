# OneCode LibreChat Shell Design

Date: 2026-05-30
Scope: OneCode-specific LibreChat shell additions
Status: Active visual direction

## Product Role

LibreChat is the mature chat shell. OneCode additions should feel like a local developer console embedded in that shell, not like a marketing page or a separate IDE.

## Visual Language

- Use LibreChat's existing tokens for background, borders, text, muted text, success, warning, and danger.
- Keep density compact and scannable. Prefer tables, tabs, status rows, split panes, and concise badges.
- Use cards only for repeated run/check items or bounded detail panels. Do not nest cards.
- Keep labels short and operational: `项目`, `运行`, `证据`, `验证`, `诊断`.
- Use monospaced text for run IDs, paths, commands, hashes, and JSON.
- Avoid hero layouts, decorative gradients, large illustrations, or marketing copy.

## OneCode Console

- The console lives as a right-side panel beside the chat stream on desktop.
- On small screens it can become a full-screen overlay.
- The input-bar OneCode button remains the lightweight project switcher and launcher.
- The console panel owns advanced kernel workflows: runs, evidence, verifier policy, doctor, and self-audit.

## Interaction Rules

- Every action that touches the filesystem must show the active workspace.
- Destructive or overwriting actions require explicit button labels such as `覆盖验证策略`.
- Error states should preserve raw kernel messages in a compact detail area.
- Empty states should be one short sentence plus the relevant action button.

## Accessibility And Responsiveness

- Icon-only controls need accessible labels.
- Text must truncate or wrap inside its container; run IDs and paths should not push layout width.
- Keyboard focus states should use existing LibreChat focus-ring behavior.
