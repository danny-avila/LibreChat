Fix pinned chats missing from the sidebar until you scroll.

Worktree: /home/berry13/.paseo/worktrees/2cter3r2/fix-pinned-section-always-fetch
Branch: fix/pinned-section-always-fetch (stacked on feat/pinned-chats-section)
Stay in this worktree. Do not reset, stash, or start a new one.

## Bug
PinnedSection filters `pinned` off the paginated Chats list (`GET /api/convos`, 25 per page, newest `updatedAt` first). Pins are not hoisted. After 25 newer chats exist, a reload hides the pin until Chats fetches the next page.

Reproduced: pin "Initial Greeting", insert 30 newer unpinned chats, reload. No Pinned section. Scroll Chats. Pin appears.

## Do this
Give Pinned its own fetch so every pin shows on first paint, without scrolling Chats.

Preferred: `GET /api/convos?pinned=true` (or equivalent) that returns only that user's pinned conversations, plus a dedicated frontend query used by PinnedSection. Pin/unpin must refresh that query. Keep pins out of the Chats date groups.

## Touch
- `packages/data-schemas/src/methods/conversation.ts` (`getConvosByCursor`)
- `api/server/routes/convos.js`
- `client/src/data-provider/queries.ts` and list params
- `client/src/components/Conversations/PinnedSection.tsx`
- `client/src/components/UnifiedSidebar/ConversationsSection.tsx`

The Pinned section UI is already in this tree (uncommitted). Do not redesign it.

## Done when
- Reload with a pin past page 1 still shows the Pinned section immediately
- Unpin still removes it; pin still adds it
- `npx eslint` on touched JS/TS is clean
- Unit tests cover the pinned list filter / query

Do not commit the dummy PINREPRO chats. Do not mention AI in commits.
