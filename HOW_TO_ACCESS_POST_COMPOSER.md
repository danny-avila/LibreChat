# How to Access the Post Composer UI

## Location

The Post Composer is now accessible via a **floating action button** in the bottom-right corner of the chat interface.

## Visual Guide

```
┌─────────────────────────────────────────┐
│  LibreChat Chat Interface               │
│                                         │
│  [Chat messages here]                   │
│                                         │
│                                         │
│  [Chat input box]                       │
│                                    ┌──┐ │
│                                    │🔗│ │ ← Floating Share Button
│                                    └──┘ │
└─────────────────────────────────────────┘
```

## How to Access

### Step 1: Look for the Blue Floating Button
- Located in the **bottom-right corner** of the screen
- Above the chat input area
- Blue circular button with a share icon (three connected dots)

### Step 2: Click the Button
- Click the floating button
- The Post Composer modal will open

### Step 3: Use the Composer
1. Write or edit your post content
2. Select which social accounts to post to (checkboxes)
3. Watch the character counter
4. Click "Post Now" to publish

## Button Appearance

The button looks like this:
- **Shape**: Circular (floating action button)
- **Color**: Blue (#2563EB)
- **Icon**: Share icon (three connected circles)
- **Position**: Fixed bottom-right
- **Hover**: Slightly darker blue with larger shadow

## When is it Visible?

The button is visible when:
- ✅ `VITE_SOCIAL_MEDIA_AUTOMATION=true` in `.env`
- ✅ You're on any chat page
- ✅ The feature is enabled in your environment

The button is hidden when:
- ❌ Social media feature is disabled in `.env`

## Keyboard Shortcut (Future)

Currently, there's no keyboard shortcut, but you can add one by:
1. Pressing the button with your mouse
2. Or we can add a keyboard shortcut like `Ctrl+Shift+S` in the future

## Alternative Access Methods (Future Enhancements)

We can add more ways to access the composer:

### 1. Message Context Menu
Right-click on any AI message → "Share to Social Media"

### 2. Message Hover Actions
Hover over a message → Click share icon

### 3. Toolbar Button
Add a button to the main toolbar

### 4. Keyboard Shortcut
`Ctrl+Shift+S` or `Cmd+Shift+S` on Mac

## Testing the Button

### 1. Start LibreChat
```bash
npm run frontend:dev
```

### 2. Navigate to Chat
- Go to http://localhost:3080
- Start or open any conversation

### 3. Look for the Button
- Check bottom-right corner
- Should see a blue circular button

### 4. Click and Test
- Click the button
- Modal should open
- Try creating a post (if you have accounts connected)

## Troubleshooting

### Button Not Visible?

**Check 1: Environment Variable**
```bash
# In .env file
VITE_SOCIAL_MEDIA_AUTOMATION=true
```

**Check 2: Rebuild Frontend**
```bash
npm run frontend:dev
# or
npm run build
```

**Check 3: Browser Console**
- Open DevTools (F12)
- Check for any errors
- Look for "SocialShareButton" component

### Button Visible But Not Working?

**Check 1: Connected Accounts**
- Go to Settings → Social Accounts
- Make sure at least one account is connected

**Check 2: Postiz Running**
```bash
docker ps | grep postiz
```

**Check 3: API Key**
- Check `.env` has `POSTIZ_API_KEY`
- Verify it's the production key from Postiz

### Modal Opens But Can't Post?

**Error: "No social accounts connected"**
- Connect accounts in Settings first

**Error: "Failed to create post"**
- Check Postiz is accessible
- Check API key is correct
- Check Postiz logs: `docker logs postiz --tail 100`

## Current Implementation

### Files:
- `client/src/components/Social/SocialShareButton.tsx` - Floating button component
- `client/src/components/Social/PostComposer.tsx` - Modal composer
- `client/src/components/Chat/ChatView.tsx` - Integration point

### Features:
- ✅ Always visible floating button
- ✅ Opens modal on click
- ✅ Responsive design
- ✅ Dark mode support
- ✅ Accessibility (aria-label, title)
- ✅ Smooth animations

## Future Enhancements

### Phase 1 (Current):
- [x] Floating action button
- [x] Basic post composer
- [x] Character limits
- [x] Account selection

### Phase 2 (Next):
- [ ] Message context menu integration
- [ ] Pre-fill with selected message text
- [ ] Keyboard shortcuts
- [ ] Toolbar button option

### Phase 3 (Future):
- [ ] Post templates
- [ ] Draft saving
- [ ] Post scheduling
- [ ] Media upload
- [ ] Post history

## Quick Start Guide

1. **Enable Feature**
   ```env
   VITE_SOCIAL_MEDIA_AUTOMATION=true
   ```

2. **Connect Social Account**
   - Settings → Social Accounts
   - Connect LinkedIn or Twitter

3. **Access Composer**
   - Look for blue button in bottom-right
   - Click to open

4. **Create Post**
   - Write content
   - Select accounts
   - Click "Post Now"

5. **Success!**
   - See success message
   - Modal closes automatically
   - Post appears on social media

---

**Need Help?**
- Check the button is visible in bottom-right corner
- Ensure `VITE_SOCIAL_MEDIA_AUTOMATION=true`
- Connect at least one social account first
- Check browser console for errors
