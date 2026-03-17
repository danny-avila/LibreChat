# Social Media Automation UI Redesign

## Requirements

1. **Remove from left sidebar**: Remove approved/pending drafts from the left nav (SocialDraftsNav) - left side is for AI chats only
2. **Right panel tab**: Replace "Start Social Draft" button with a "Social Media" tab in the right panel
3. **Social Media Dashboard**: Clicking the tab opens a dashboard with:
   - Tabs: Pending | Approved
   - Delete button on each draft
   - "New Draft" button to create a new draft
4. **Remove floating button**: Remove the floating "Share to Social Media" blue button from the chat view

## Files to Change

| File | Change |
|------|--------|
| `client/src/components/Nav/SocialDraftsNav.tsx` | Remove entirely from left nav |
| `client/src/components/Nav/Nav.tsx` | Remove SocialDraftsNav usage |
| `client/src/components/Social/SocialShareButton.tsx` | Remove floating button |
| `client/src/components/Chat/ChatView.tsx` | Remove SocialShareButton usage |
| `client/src/components/SidePanel/SidePanel.tsx` | Replace openSocialDraft with openSocialDashboard |
| `client/src/components/SidePanel/` | Create new `SocialMediaPanel.tsx` dashboard component |
| `client/src/hooks/useSideNavLinks.ts` | Update link to open dashboard panel instead of modal |

## Progress

- [x] Remove SocialDraftsNav from left sidebar
- [x] Remove floating SocialShareButton from ChatView
- [x] Create SocialMediaPanel dashboard component (Pending/Approved tabs + delete + new draft)
- [x] Wire up right panel tab to open SocialMediaPanel (inline accordion, no modal)
- [x] Add DELETE /api/social-drafts/:id backend endpoint
- [ ] Test end-to-end
