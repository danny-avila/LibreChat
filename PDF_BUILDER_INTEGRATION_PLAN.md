# PDF Builder Integration Plan

## 📋 Overview

**Objective**: Integrate the standalone PDF Builder application into LibreChat via an iframe modal interface with postMessage communication.

**PDF Builder URL**: `https://client.dev.scaffad.cloud.jamot.pro/`

**Integration Type**: Frontend-only iframe integration with bidirectional postMessage API

**Key Principle**: PDF Builder is a **completely independent application**. No backend dependencies, no n8n involvement - pure iframe embedding with message passing.

---

## 🎯 Design Decisions

### Modal Specifications

| Aspect | Decision | Rationale |
|--------|----------|-----------|
| **Type** | Centered Partial Modal | Best balance of workspace and context |
| **Desktop Size** | 85vw × 88vh (max: 1400px × 900px) | Spacious without being overwhelming |
| **Mobile Size** | 100vw × 100vh (full-screen) | Mobile-first, maximize usable space |
| **Backdrop** | Semi-transparent (40% black) | Shows chat context behind |
| **Close Method** | × button + ESC key only | Prevents accidental closure |
| **Animation** | Fade + Scale (200ms) | Smooth, professional entrance |

### Trigger Mechanism

**Primary**: Button in top navigation bar
- Location: Between "Agents" and "Profile" icons
- Icon: 📄 or custom PDF icon
- Label: "PDF Builder" (visible on hover)

**Secondary** (Future Enhancement):
- Message context menu (right-click)
- Slash command `/pdf`

### User Flow

```
1. User clicks "PDF Builder" button in nav
2. Modal fades in with backdrop
3. Iframe loads PDF Builder app
4. PDF Builder sends READY event
5. LibreChat sends INIT with user context
6. User interacts with PDF Builder
7. User generates PDF
8. PDF Builder sends PDF_GENERATED event
9. LibreChat shows success toast + download link
10. User clicks × or ESC to close modal
```

---

## 🏗️ Architecture

### Component Structure

```
client/src/components/
└── PDFBuilder/
    ├── index.ts                      # Exports
    ├── PDFBuilderModal.tsx           # Main modal container (Radix Dialog)
    ├── PDFBuilderIframe.tsx          # Iframe component with postMessage logic
    ├── PDFBuilderTrigger.tsx         # Nav button trigger
    └── usePDFBuilder.ts              # Custom hook for modal state
```

### State Management

**Recoil Atom** (`client/src/store/pdfBuilder.ts`):
```typescript
interface PDFBuilderState {
  isOpen: boolean;              // Modal open/closed
  isReady: boolean;             // Iframe loaded and ready
  isGenerating: boolean;        // PDF generation in progress
  lastGeneratedPDF: {           // Last successful generation
    url: string;
    jobId: string;
    templateName: string;
    timestamp: number;
  } | null;
}
```

### Data Flow

```
User Action (Click Button)
    ↓
Recoil State Update (isOpen: true)
    ↓
PDFBuilderModal Renders
    ↓
PDFBuilderIframe Mounts
    ↓
Iframe Loads → Sends LOAD event
    ↓
Iframe Ready → Sends READY event
    ↓
LibreChat Sends INIT (userId, conversationId)
    ↓
User Generates PDF
    ↓
Iframe Sends PDF_GENERATED (pdfUrl, jobId, etc.)
    ↓
LibreChat Shows Toast Notification
    ↓
User Closes Modal (× or ESC)
    ↓
Recoil State Update (isOpen: false)
```

---

## 📦 Implementation Plan

### Phase 1: Core Infrastructure (Day 1)

#### Task 1.1: Create State Management
**File**: `client/src/store/pdfBuilder.ts`

```typescript
import { atom } from 'recoil';

export const pdfBuilderState = atom({
  key: 'pdfBuilderState',
  default: {
    isOpen: false,
    isReady: false,
    isGenerating: false,
    lastGeneratedPDF: null,
  },
});
```

**Dependencies**: None (Recoil already in stack)

---

#### Task 1.2: Create Iframe Component
**File**: `client/src/components/PDFBuilder/PDFBuilderIframe.tsx`

**Responsibilities**:
- Render iframe with correct URL
- Create ref to access iframe DOM element
- Set up postMessage listeners (receive)
- Send postMessage to iframe (transmit)
- Handle all message types (READY, PDF_GENERATED, ERROR, etc.)
- Sync theme with LibreChat's theme system

**Props**:
```typescript
interface PDFBuilderIframeProps {
  url: string;                                          // PDF Builder URL
  userId: string;                                       // Current user ID
  conversationId: string | null;                        // Current conversation ID
  theme: 'dark' | 'light';                              // Current theme
  onReady?: () => void;                                 // Callback when ready
  onPDFGenerated?: (payload: PDFGeneratedPayload) => void;
  onError?: (payload: ErrorPayload) => void;
  onClose?: () => void;                                 // User clicked close in iframe
}
```

**Key Methods**:
- `sendMessage(type, payload)` - Send postMessage to iframe
- `handleMessage(event)` - Process incoming messages
- Theme sync on mount and when theme changes

**Dependencies**:
- React hooks: `useRef`, `useEffect`, `useCallback`
- LibreChat theme context: `useTheme()` hook (exists in codebase)
- TypeScript types from doc.md

---

#### Task 1.3: Create Modal Container
**File**: `client/src/components/PDFBuilder/PDFBuilderModal.tsx`

**Responsibilities**:
- Render Radix Dialog with backdrop
- Control modal open/closed state
- Handle animations (Framer Motion)
- Render header with title and close button
- Embed PDFBuilderIframe in body
- Lock body scroll when open
- Handle ESC key press

**Structure**:
```tsx
<Dialog.Root open={isOpen} onOpenChange={setIsOpen}>
  {/* Backdrop */}
  <Dialog.Overlay />
  
  {/* Modal Card */}
  <Dialog.Content>
    {/* Header */}
    <ModalHeader>
      <Dialog.Title>PDF Builder</Dialog.Title>
      <Dialog.Close>×</Dialog.Close>
    </ModalHeader>
    
    {/* Body */}
    <ModalBody>
      {isOpen && (
        <PDFBuilderIframe
          url={PDF_BUILDER_URL}
          userId={user.id}
          conversationId={currentConversationId}
          theme={theme}
          onPDFGenerated={handlePDFGenerated}
          onError={handleError}
          onClose={handleClose}
        />
      )}
    </ModalBody>
  </Dialog.Content>
</Dialog.Root>
```

**Dependencies**:
- `@radix-ui/react-dialog` (already in package.json)
- `framer-motion` (already in package.json)
- Recoil state: `pdfBuilderState`
- Auth context for `user.id`
- Conversation context for `conversationId`

---

#### Task 1.4: Create Trigger Button
**File**: `client/src/components/PDFBuilder/PDFBuilderTrigger.tsx`

**Responsibilities**:
- Render button in nav bar
- Open modal on click
- Show tooltip on hover
- Accessible (aria-label, keyboard support)

**Visual Design**:
```tsx
<button
  onClick={() => setPDFBuilderOpen(true)}
  className="nav-icon-button"  // Reuse existing nav button styles
  aria-label="Open PDF Builder"
>
  <PDFIcon />  {/* Custom icon or emoji 📄 */}
</button>
```

**Location**: Add to `client/src/components/Nav/` navigation bar component

**Dependencies**:
- Recoil setter for `pdfBuilderState`
- SVG icon (create or use lucide-react icon)

---

### Phase 2: Integration (Day 2)

#### Task 2.1: Add to Navigation Bar
**File**: `client/src/components/Nav/Nav.tsx` (or similar nav component)

**Changes**:
1. Import `<PDFBuilderTrigger />`
2. Add button between Agents and Profile icons
3. Ensure responsive behavior (hide text on mobile, show icon only)

**Example**:
```tsx
<nav className="flex items-center gap-2">
  <ChatButton />
  <SearchButton />
  <AgentsButton />
  <PDFBuilderTrigger />  {/* NEW */}
  <ProfileButton />
</nav>
```

---

#### Task 2.2: Add Modal to Root Layout
**File**: `client/src/routes/Root.tsx` or `client/src/App.tsx`

**Changes**:
1. Import `<PDFBuilderModal />`
2. Render at root level (outside main content, for proper portal rendering)

**Example**:
```tsx
function Root() {
  return (
    <>
      <NavBar />
      <MainContent />
      <SidePanel />
      
      {/* Modals */}
      <PDFBuilderModal />  {/* NEW - Renders via portal */}
    </>
  );
}
```

**Why root level?**: Radix Dialog uses React Portal - renders outside normal DOM hierarchy to avoid z-index issues

---

#### Task 2.3: Connect User Context
**Files**: 
- `client/src/hooks/AuthContext.tsx` (user data)
- `client/src/store/conversation.ts` (current conversation)

**Changes**:
```tsx
// In PDFBuilderModal
const { user } = useAuthContext();  // Get current user
const currentConversation = useRecoilValue(conversationSelector);

<PDFBuilderIframe
  userId={user?.id || ''}
  conversationId={currentConversation?.conversationId || null}
  // ...
/>
```

---

#### Task 2.4: Connect Theme System
**File**: `client/src/Providers/ThemeProvider.tsx`

**Changes**:
```tsx
// In PDFBuilderModal
const { theme } = useTheme();  // Get current theme ('dark' | 'light')

<PDFBuilderIframe
  theme={theme}
  // ...
/>
```

**How it works**:
1. LibreChat theme changes (user toggles)
2. `useTheme()` hook updates
3. PDFBuilderIframe receives new `theme` prop
4. `useEffect` detects change
5. Sends `THEME_CHANGE` message to iframe
6. PDF Builder updates its theme

---

### Phase 3: Message Handling (Day 2-3)

#### Task 3.1: Implement postMessage Receiving
**File**: `client/src/components/PDFBuilder/PDFBuilderIframe.tsx`

**Messages to Handle**:

| Message Type | Action |
|-------------|--------|
| `LOAD` | Log to console (optional loading state) |
| `READY` | Set `isReady: true`, send `INIT` message |
| `GET_THEME` | Send `THEME_CHANGE` with current theme |
| `PDF_GENERATED` | Show success toast, save PDF metadata, call callback |
| `ERROR` | Show error toast, log error, call error callback |
| `CLOSE` | Close modal (user clicked close button in iframe) |

**Implementation**:
```typescript
useEffect(() => {
  const handleMessage = (event: MessageEvent) => {
    // Security: Validate origin in production
    // if (event.origin !== PDF_BUILDER_URL) return;
    
    const { type, payload } = event.data;
    
    switch (type) {
      case 'READY':
        setIsReady(true);
        sendMessage('INIT', {
          userId,
          conversationId,
        });
        onReady?.();
        break;
        
      case 'GET_THEME':
        sendMessage('THEME_CHANGE', { theme });
        break;
        
      case 'PDF_GENERATED':
        handlePDFGenerated(payload);
        break;
        
      case 'ERROR':
        handleError(payload);
        break;
        
      case 'CLOSE':
        onClose?.();
        break;
    }
  };
  
  window.addEventListener('message', handleMessage);
  return () => window.removeEventListener('message', handleMessage);
}, [userId, conversationId, theme, sendMessage]);
```

---

#### Task 3.2: Implement postMessage Sending
**File**: `client/src/components/PDFBuilder/PDFBuilderIframe.tsx`

**Messages to Send**:

| Message Type | When | Payload |
|-------------|------|---------|
| `INIT` | After receiving `READY` | `{ userId, conversationId }` |
| `THEME_CHANGE` | After `GET_THEME` or theme changes | `{ theme: 'dark' \| 'light' }` |

**Implementation**:
```typescript
const sendMessage = useCallback((type: string, payload?: any) => {
  if (!iframeRef.current?.contentWindow) {
    console.warn('[PDFBuilder] Cannot send message: iframe not ready');
    return;
  }
  
  iframeRef.current.contentWindow.postMessage(
    { type, payload },
    PDF_BUILDER_URL  // Target origin (security)
  );
  
  console.log(`[PDFBuilder] Sent: ${type}`, payload);
}, []);
```

---

#### Task 3.3: Handle PDF Generation
**File**: `client/src/components/PDFBuilder/PDFBuilderIframe.tsx`

**When**: Iframe sends `PDF_GENERATED` event

**Payload**:
```typescript
{
  pdfUrl: string;         // Download URL
  jobId: string;          // Unique job ID
  templateName: string;   // Template used
  copies: number;         // Number of copies
}
```

**Actions**:
1. **Save to Recoil state**:
   ```typescript
   setPDFBuilderState(prev => ({
     ...prev,
     lastGeneratedPDF: {
       ...payload,
       timestamp: Date.now(),
     },
   }));
   ```

2. **Show success toast** (using LibreChat's toast system):
   ```typescript
   showToast({
     title: 'PDF Generated Successfully!',
     description: `Template: ${payload.templateName}`,
     status: 'success',
     action: (
       <Button onClick={() => window.open(payload.pdfUrl, '_blank')}>
         Download PDF
       </Button>
     ),
   });
   ```

3. **Call callback** (if provided):
   ```typescript
   onPDFGenerated?.(payload);
   ```

4. **Optional**: Auto-close modal after 2 seconds
   ```typescript
   setTimeout(() => setIsOpen(false), 2000);
   ```

---

#### Task 3.4: Handle Errors
**File**: `client/src/components/PDFBuilder/PDFBuilderIframe.tsx`

**When**: Iframe sends `ERROR` event

**Payload**:
```typescript
{
  message: string;      // Error message
  context?: string;     // Additional context
}
```

**Actions**:
1. **Show error toast**:
   ```typescript
   showToast({
     title: 'PDF Generation Failed',
     description: payload.message,
     status: 'error',
   });
   ```

2. **Log error**:
   ```typescript
   console.error('[PDFBuilder] Error:', payload);
   ```

3. **Call callback**:
   ```typescript
   onError?.(payload);
   ```

---

### Phase 4: Styling & Polish (Day 3)

#### Task 4.1: Modal Styling
**File**: `client/src/components/PDFBuilder/PDFBuilderModal.tsx`

**Tailwind Classes**:
```tsx
// Backdrop
<Dialog.Overlay className="
  fixed inset-0 
  bg-black/40 
  backdrop-blur-sm
  z-50
  data-[state=open]:animate-in 
  data-[state=closed]:animate-out
  data-[state=closed]:fade-out-0 
  data-[state=open]:fade-in-0
" />

// Modal Content
<Dialog.Content className="
  fixed 
  left-1/2 top-1/2 
  -translate-x-1/2 -translate-y-1/2
  w-[85vw] max-w-[1400px]
  h-[88vh] max-h-[900px]
  bg-white dark:bg-gray-900
  border border-gray-200 dark:border-gray-700
  rounded-2xl
  shadow-2xl dark:shadow-black/50
  z-50
  data-[state=open]:animate-in 
  data-[state=closed]:animate-out
  data-[state=closed]:fade-out-0 
  data-[state=open]:fade-in-0
  data-[state=closed]:zoom-out-95 
  data-[state=open]:zoom-in-95
">
```

**Responsive**:
```tsx
// Mobile: Full screen
@media (max-width: 768px) {
  .pdf-builder-modal {
    width: 100vw;
    height: 100vh;
    border-radius: 0;
  }
}
```

---

#### Task 4.2: Header Styling
**File**: `client/src/components/PDFBuilder/PDFBuilderModal.tsx`

```tsx
<div className="
  flex items-center justify-between
  px-6 py-4
  border-b border-gray-200 dark:border-gray-700
">
  <Dialog.Title className="
    text-lg font-semibold
    text-gray-900 dark:text-gray-100
  ">
    📄 PDF Builder
  </Dialog.Title>
  
  <Dialog.Close className="
    p-2 rounded-lg
    hover:bg-gray-100 dark:hover:bg-gray-800
    transition-colors
  ">
    <XIcon className="w-5 h-5" />
  </Dialog.Close>
</div>
```

---

#### Task 4.3: Trigger Button Styling
**File**: `client/src/components/PDFBuilder/PDFBuilderTrigger.tsx`

**Match existing nav button style**:
```tsx
<button className="
  flex items-center gap-2
  px-3 py-2
  rounded-lg
  text-gray-700 dark:text-gray-300
  hover:bg-gray-100 dark:hover:bg-gray-800
  transition-colors
  focus:outline-none 
  focus:ring-2 
  focus:ring-blue-500
">
  <PDFIcon className="w-5 h-5" />
  <span className="hidden md:inline">PDF Builder</span>
</button>
```

---

#### Task 4.4: Loading State
**File**: `client/src/components/PDFBuilder/PDFBuilderIframe.tsx`

**Show spinner while iframe loads**:
```tsx
{!isReady && (
  <div className="absolute inset-0 flex items-center justify-center bg-white dark:bg-gray-900">
    <Spinner className="w-8 h-8" />
    <p className="ml-3 text-gray-600 dark:text-gray-400">
      Loading PDF Builder...
    </p>
  </div>
)}

<iframe
  ref={iframeRef}
  src={url}
  className={cn(
    "w-full h-full border-0",
    !isReady && "opacity-0"  // Hide until ready
  )}
  allow="clipboard-write"
  title="PDF Builder"
/>
```

---

### Phase 5: TypeScript & Types (Day 3)

#### Task 5.1: Create Type Definitions
**File**: `client/src/components/PDFBuilder/types.ts`

```typescript
// Message types
export type PDFBuilderMessageType = 
  | 'LOAD'
  | 'READY'
  | 'PDF_GENERATED'
  | 'ERROR'
  | 'CLOSE'
  | 'INIT'
  | 'GET_THEME'
  | 'THEME_CHANGE';

// Message structure
export interface PDFBuilderMessage {
  type: PDFBuilderMessageType;
  payload?: unknown;
}

// Payload types
export interface PDFGeneratedPayload {
  pdfUrl: string;
  jobId: string;
  templateName: string;
  copies: number;
}

export interface ErrorPayload {
  message: string;
  context?: string;
}

export interface InitPayload {
  userId: string;
  conversationId: string | null;
  templateHint?: string;
}

export interface ThemeChangePayload {
  theme: 'dark' | 'light';
}

// Component props
export interface PDFBuilderIframeProps {
  url: string;
  userId: string;
  conversationId: string | null;
  theme: 'dark' | 'light';
  onReady?: () => void;
  onPDFGenerated?: (payload: PDFGeneratedPayload) => void;
  onError?: (payload: ErrorPayload) => void;
  onClose?: () => void;
}
```

---

#### Task 5.2: Type All Components
- `PDFBuilderModal.tsx` - Props, state
- `PDFBuilderIframe.tsx` - Props, message handlers
- `PDFBuilderTrigger.tsx` - Props (if any)
- `usePDFBuilder.ts` - Return type

---

### Phase 6: Testing (Day 4)

#### Task 6.1: Manual Testing Checklist

**Modal Functionality**:
- [ ] Modal opens when clicking trigger button
- [ ] Modal closes with × button
- [ ] Modal closes with ESC key
- [ ] Backdrop does NOT close modal (click is ignored)
- [ ] Body scroll is locked when modal is open
- [ ] Modal is centered on screen

**Iframe Communication**:
- [ ] Iframe loads successfully
- [ ] READY event received
- [ ] INIT message sent with correct userId and conversationId
- [ ] Theme sync works (try toggling theme)
- [ ] GET_THEME request handled correctly

**PDF Generation**:
- [ ] User can generate PDF in iframe
- [ ] PDF_GENERATED event received
- [ ] Success toast appears with download link
- [ ] PDF downloads successfully
- [ ] Last generated PDF saved to Recoil state

**Error Handling**:
- [ ] ERROR event shows error toast
- [ ] Errors logged to console
- [ ] Modal remains functional after error

**Responsive**:
- [ ] Desktop: Modal is 85vw × 88vh
- [ ] Tablet: Modal adjusts appropriately
- [ ] Mobile: Modal is full-screen
- [ ] Button label hides on mobile (icon only)

**Theme**:
- [ ] Dark mode: Modal has dark background
- [ ] Light mode: Modal has light background
- [ ] Theme change propagates to iframe
- [ ] Iframe updates theme in real-time

**Accessibility**:
- [ ] Focus trapped in modal when open
- [ ] ESC key closes modal
- [ ] Close button is keyboard accessible
- [ ] aria-labels present

---

#### Task 6.2: Edge Cases

- [ ] Multiple rapid opens/closes (no memory leak)
- [ ] Switch conversation while modal is open (conversationId updates)
- [ ] Logout while modal is open (modal closes)
- [ ] Iframe fails to load (show error state)
- [ ] Slow network (loading state appears)

---

#### Task 6.3: Browser Testing

- [ ] Chrome (desktop)
- [ ] Firefox (desktop)
- [ ] Safari (desktop)
- [ ] Chrome (mobile)
- [ ] Safari (iOS)

---

### Phase 7: Documentation (Day 4)

#### Task 7.1: Code Comments
- Add JSDoc comments to all exported functions
- Document complex logic (postMessage handling)
- Add type annotations everywhere

#### Task 7.2: README
**File**: `client/src/components/PDFBuilder/README.md`

Contents:
- Component overview
- How to use
- Props documentation
- Message flow diagram
- Troubleshooting guide

---

## 📂 File Structure (Final)

```
client/src/
├── components/
│   └── PDFBuilder/
│       ├── index.ts                    # Exports
│       ├── PDFBuilderModal.tsx         # Main modal (Radix Dialog)
│       ├── PDFBuilderIframe.tsx        # Iframe + postMessage
│       ├── PDFBuilderTrigger.tsx       # Nav button
│       ├── types.ts                    # TypeScript types
│       ├── README.md                   # Documentation
│       └── __tests__/                  # Tests (future)
│           ├── PDFBuilderModal.test.tsx
│           └── PDFBuilderIframe.test.tsx
│
├── store/
│   └── pdfBuilder.ts                   # Recoil state atom
│
└── hooks/
    └── usePDFBuilder.ts                # Custom hook (optional)
```

---

## 🔧 Configuration

### Environment Variables

**File**: `.env`

```bash
# PDF Builder URL
VITE_PDF_BUILDER_URL=https://client.dev.scaffad.cloud.jamot.pro/

# Optional: Enable/disable feature
VITE_ENABLE_PDF_BUILDER=true
```

**Usage in code**:
```typescript
const PDF_BUILDER_URL = import.meta.env.VITE_PDF_BUILDER_URL;
```

---

## 🚀 Deployment Checklist

**Before Production**:
- [ ] Add origin validation in postMessage handler
  ```typescript
  if (event.origin !== PDF_BUILDER_URL) {
    console.warn('Rejected message from unauthorized origin:', event.origin);
    return;
  }
  ```

- [ ] Remove debug console.logs (or use debug flag)
- [ ] Test on production URL
- [ ] Verify HTTPS (mixed content warnings)
- [ ] Check CSP (Content Security Policy) allows iframe

---

## 🎯 Success Criteria

### Functional Requirements
✅ User can open PDF Builder from nav bar
✅ PDF Builder loads in modal
✅ User can generate PDFs
✅ Generated PDF URL received
✅ Success notification shown
✅ Modal can be closed
✅ Theme syncs automatically

### Non-Functional Requirements
✅ Modal opens in <200ms
✅ Iframe loads in <3s (network dependent)
✅ No memory leaks (tested with rapid open/close)
✅ Accessible (keyboard navigation, screen reader)
✅ Responsive (desktop, tablet, mobile)
✅ Works in all major browsers

---

## 📊 Timeline Estimate

| Phase | Tasks | Estimated Time |
|-------|-------|----------------|
| **Phase 1**: Core Infrastructure | 1.1 - 1.4 | 4-5 hours |
| **Phase 2**: Integration | 2.1 - 2.4 | 2-3 hours |
| **Phase 3**: Message Handling | 3.1 - 3.4 | 3-4 hours |
| **Phase 4**: Styling & Polish | 4.1 - 4.4 | 2-3 hours |
| **Phase 5**: TypeScript & Types | 5.1 - 5.2 | 1-2 hours |
| **Phase 6**: Testing | 6.1 - 6.3 | 2-3 hours |
| **Phase 7**: Documentation | 7.1 - 7.2 | 1 hour |
| **Total** | | **15-21 hours** |

**Realistic Estimate**: 2-3 days for single developer

---

## 🛠️ Development Dependencies

**Already in LibreChat** (no installation needed):
- ✅ React 18.2
- ✅ TypeScript
- ✅ Recoil (state management)
- ✅ @radix-ui/react-dialog (modal)
- ✅ framer-motion (animations)
- ✅ Tailwind CSS (styling)
- ✅ lucide-react (icons)

**No new dependencies required!** 🎉

---

## 🔒 Security Considerations

### 1. Origin Validation
**Always validate message origin in production**:
```typescript
const PDF_BUILDER_ORIGIN = new URL(PDF_BUILDER_URL).origin;

if (event.origin !== PDF_BUILDER_ORIGIN) {
  return; // Reject
}
```

### 2. Data Sanitization
- Don't trust iframe data blindly
- Validate `pdfUrl` format before opening
- Sanitize error messages before displaying

### 3. CSP (Content Security Policy)
Ensure CSP allows iframe from PDF Builder domain:
```
frame-src https://client.dev.scaffad.cloud.jamot.pro;
```

### 4. HTTPS
- PDF Builder must be served over HTTPS
- Mixed content (HTTPS → HTTP) will be blocked by browsers

---

## 🐛 Known Limitations & Future Enhancements

### Limitations
- Iframe cannot access parent DOM (by design - security)
- PDF download goes through browser (no server-side storage initially)
- One modal instance at a time (no multi-window support)

### Future Enhancements (Post-MVP)
1. **Message Context Menu**: Right-click message → "Create PDF"
2. **Slash Command**: `/pdf` to open modal
3. **Template Hints**: Pre-select template based on conversation type
4. **PDF History**: Show list of previously generated PDFs
5. **Auto-Attach**: Attach generated PDF to conversation as file
6. **Backend Integration**: Save PDF metadata to MongoDB
7. **Minimize Feature**: Collapse modal to small floating button
8. **Keyboard Shortcut**: `Cmd/Ctrl + Shift + P` to open
9. **Multi-Language**: Translate modal UI (i18n)
10. **Analytics**: Track PDF generation events

---

## 📞 Support & Troubleshooting

### Common Issues

**Issue**: Modal doesn't open
- Check Recoil state is updating (`isOpen: true`)
- Verify `PDFBuilderModal` is rendered at root level
- Check browser console for errors

**Issue**: Iframe shows blank
- Verify URL is correct
- Check network tab (CORS, CSP blocking?)
- Try opening URL directly in new tab

**Issue**: Messages not received
- Check `window.addEventListener('message')` is set up
- Log all incoming messages to debug
- Verify message format matches expected structure

**Issue**: Theme not syncing
- Check `useTheme()` hook is working
- Verify `THEME_CHANGE` message is sent
- Log theme value in useEffect dependency array

**Issue**: PDF download doesn't work
- Verify `pdfUrl` is valid
- Check CORS (PDF must allow cross-origin download)
- Try opening URL directly

---

## ✅ Pre-Implementation Checklist

Before starting to code:
- [ ] Plan approved by team/stakeholder
- [ ] Design reviewed (modal size, placement, behavior)
- [ ] PDF Builder URL confirmed and accessible
- [ ] LibreChat theme system understood
- [ ] Recoil state management pattern reviewed
- [ ] Radix Dialog documentation read
- [ ] postMessage API understood
- [ ] Development environment ready

---

## 📝 Notes

- **No backend changes required** - This is a pure frontend integration
- **No database changes required** - PDF metadata stored in Recoil (temporary)
- **No API endpoints required** - postMessage handles all communication
- **No authentication required** - userId passed via postMessage
- **Independent deployment** - PDF Builder runs on separate domain

---

## 🎉 Conclusion

This plan provides a **complete, step-by-step implementation guide** for integrating the PDF Builder iframe into LibreChat. The integration is:

✅ **Simple**: No backend complexity, pure frontend
✅ **Secure**: Origin validation, isolated iframe
✅ **Fast**: Minimal overhead, direct communication
✅ **Maintainable**: Clear structure, TypeScript types
✅ **Scalable**: Easy to extend with future features

**Ready to start coding when you are!** 🚀

---

**Document Version**: 1.0
**Last Updated**: 2026-01-06
**Author**: LibreChat PDF Builder Integration Team
