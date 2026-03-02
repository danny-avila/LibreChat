# Feature Flag: Social Accounts Tab

## Overview
The Social Accounts tab in Settings is now gated behind the `VITE_SOCIAL_MEDIA_AUTOMATION` feature flag.

## Configuration

### Enable Social Media Features
```env
VITE_SOCIAL_MEDIA_AUTOMATION=true
```

### Disable Social Media Features
```env
VITE_SOCIAL_MEDIA_AUTOMATION=false
# or simply omit the variable
```

## What's Gated

When `VITE_SOCIAL_MEDIA_AUTOMATION=true`:
- ✅ Social Accounts tab appears in Settings
- ✅ "Start Social Draft" link in sidebar
- ✅ Pending/Approved drafts in sidebar
- ✅ Floating share button in chat
- ✅ PostComposer component

When `VITE_SOCIAL_MEDIA_AUTOMATION=false` or not set:
- ❌ Social Accounts tab hidden
- ❌ Social draft features hidden
- ❌ Floating share button hidden
- ❌ No social media UI elements

## Implementation

### Files Modified

**`client/src/components/Nav/Settings.tsx`**

1. **Keyboard Navigation Tabs:**
```typescript
const tabs: SettingsTabValues[] = [
  // ... other tabs
  ...(import.meta.env.VITE_SOCIAL_MEDIA_AUTOMATION === 'true' 
    ? [SettingsTabValues.SOCIAL_ACCOUNTS] 
    : []),
  SettingsTabValues.ACCOUNT,
];
```

2. **Tab Buttons:**
```typescript
...(import.meta.env.VITE_SOCIAL_MEDIA_AUTOMATION === 'true'
  ? [{
      value: SettingsTabValues.SOCIAL_ACCOUNTS,
      icon: <Network className="icon-sm" />,
      label: 'com_nav_setting_social_accounts',
    }]
  : []),
```

3. **Tab Content:**
```typescript
{import.meta.env.VITE_SOCIAL_MEDIA_AUTOMATION === 'true' && (
  <Tabs.Content value={SettingsTabValues.SOCIAL_ACCOUNTS}>
    <SocialAccountsSettings />
  </Tabs.Content>
)}
```

## Other Feature-Gated Components

### SocialDraftsNav (Sidebar)
**File:** `client/src/components/Nav/SocialDraftsNav.tsx`
```typescript
const showSocialDraft = import.meta.env.VITE_SOCIAL_MEDIA_AUTOMATION === 'true';
if (!showSocialDraft) return null;
```

### SocialShareButton (Floating Button)
**File:** `client/src/components/Social/SocialShareButton.tsx`
```typescript
const isSocialMediaEnabled = import.meta.env.VITE_SOCIAL_MEDIA_AUTOMATION === 'true';
if (!isSocialMediaEnabled) return null;
```

## Testing

### Test with Feature Enabled:
1. Set `VITE_SOCIAL_MEDIA_AUTOMATION=true` in `.env`
2. Restart frontend: `npm run frontend:dev`
3. Open Settings
4. ✅ Should see "Social Accounts" tab
5. ✅ Should see social draft links in sidebar
6. ✅ Should see floating share button

### Test with Feature Disabled:
1. Set `VITE_SOCIAL_MEDIA_AUTOMATION=false` in `.env`
2. Restart frontend: `npm run frontend:dev`
3. Open Settings
4. ❌ Should NOT see "Social Accounts" tab
5. ❌ Should NOT see social draft links in sidebar
6. ❌ Should NOT see floating share button

## Production Deployment

### Enable for Production:
```bash
# In production .env
VITE_SOCIAL_MEDIA_AUTOMATION=true
```

### Disable for Production:
```bash
# In production .env
VITE_SOCIAL_MEDIA_AUTOMATION=false
# or remove the line entirely
```

## Benefits

✅ **Clean UI** - No social media features when not configured
✅ **Easy Toggle** - Single env var controls all social features
✅ **No Errors** - Users won't see broken features if Postiz isn't set up
✅ **Gradual Rollout** - Can enable for specific environments
✅ **Testing** - Easy to test with/without social features

## Related Environment Variables

```env
# Feature flag (frontend)
VITE_SOCIAL_MEDIA_AUTOMATION=true

# Postiz integration (backend)
POSTIZ_API_URL=https://postiz.cloud.jamot.pro/api
POSTIZ_API_KEY=your_api_key_here

# n8n integration (backend)
N8N_WEBHOOK_URL=https://n8n-esksoko8wgcg8w00gg880s8k.cloud.jamot.pro
```

## Troubleshooting

### Tab still showing after setting to false?
- Restart the frontend dev server
- Clear browser cache
- Check `.env` file has correct value

### Tab not showing after setting to true?
- Verify `.env` has `VITE_SOCIAL_MEDIA_AUTOMATION=true`
- Restart frontend: `npm run frontend:dev`
- Check browser console for errors

### Works in dev but not production?
- Ensure production `.env` has the variable
- Rebuild frontend: `npm run build`
- Restart production server

---

**Status:** ✅ Complete - Social Accounts tab is now feature-flagged
