# Sidebar Approved Drafts - PostComposer Integration

## Problem
Clicking on approved drafts in the sidebar was opening the "Start Social Draft" modal instead of the PostComposer with the draft content.

## Solution
Created a global state for PostComposer and updated the sidebar to differentiate between pending and approved drafts.

## Changes Made

### 1. Created PostComposer State (`client/src/store/postComposer.ts`)
```typescript
export type PostComposerState = {
  isOpen: boolean;
  initialContent?: string;
};
```

This allows any component to open the PostComposer with pre-filled content.

### 2. Updated SocialDraftsNav (`client/src/components/Nav/SocialDraftsNav.tsx`)

**Before:**
- All drafts (pending and approved) opened the Social Draft Modal

**After:**
- **Pending drafts** → Open Social Draft Modal (for approval)
- **Approved drafts** → Open PostComposer with content (for posting)

```typescript
const openDraft = (draft: SocialDraftRecord, isApproved: boolean) => {
  if (isApproved) {
    // Open PostComposer with draft content
    setPostComposerState({
      isOpen: true,
      initialContent: firstDraft,
    });
  } else {
    // Open Social Draft Modal for approval
    setSocialDraftState({ isOpen: true });
  }
};
```

### 3. Updated PostComposer (`client/src/components/Social/PostComposer.tsx`)

**Added:**
- Recoil state integration
- Support for both prop-based and state-based opening
- Unified `handleClose()` that resets all state

**Features:**
- Can be opened via props (existing behavior)
- Can be opened via Recoil state (new behavior)
- Automatically loads content from state or props
- Resets state on close

## User Flow

### Pending Drafts (Sidebar):
```
1. User clicks pending draft in sidebar
   ↓
2. Social Draft Modal opens
   ↓
3. User sees draft details
   ↓
4. User clicks "Approve"
   ↓
5. PostComposer opens with content
```

### Approved Drafts (Sidebar):
```
1. User clicks approved draft in sidebar
   ↓
2. PostComposer opens immediately with content
   ↓
3. User edits and posts
```

## Benefits

✅ **Intuitive UX**: Approved drafts go straight to posting
✅ **Faster workflow**: Skip the approval modal for already-approved content
✅ **Consistent behavior**: Same PostComposer used everywhere
✅ **Flexible**: Can open PostComposer from anywhere using Recoil state

## How to Use

### From Any Component:

```typescript
import { useSetRecoilState } from 'recoil';
import postComposerState from '~/store/postComposer';

function MyComponent() {
  const setPostComposerState = useSetRecoilState(postComposerState);
  
  const openWithContent = (content: string) => {
    setPostComposerState({
      isOpen: true,
      initialContent: content,
    });
  };
  
  return (
    <button onClick={() => openWithContent('My post content')}>
      Open PostComposer
    </button>
  );
}
```

### Via Props (Existing):

```typescript
<PostComposer
  isOpen={isOpen}
  onClose={() => setIsOpen(false)}
  initialContent="My post content"
/>
```

## Testing

1. **Test Pending Draft:**
   - Click a pending draft in sidebar
   - Should open Social Draft Modal
   - Approve it
   - Should open PostComposer

2. **Test Approved Draft:**
   - Click an approved draft in sidebar
   - Should open PostComposer immediately
   - Content should be pre-filled
   - Can edit and post

3. **Test Floating Button:**
   - Click floating share button
   - Should open PostComposer (empty)
   - Works independently

## Files Modified

1. ✅ `client/src/store/postComposer.ts` - Created
2. ✅ `client/src/components/Nav/SocialDraftsNav.tsx` - Updated
3. ✅ `client/src/components/Social/PostComposer.tsx` - Updated

## Future Enhancements

- Add platform selection to sidebar (show which platforms the draft is for)
- Add edit button in sidebar to modify draft before posting
- Add delete button for approved drafts
- Show character count preview in sidebar
