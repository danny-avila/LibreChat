# PDF Builder Integration

A complete iframe-based integration that embeds the PDF Builder application into LibreChat with full bidirectional communication via the postMessage API.

## 📋 Overview

This integration allows users to generate PDFs directly from LibreChat through a modal interface. The PDF Builder runs as an independent application in an iframe, communicating with LibreChat via standardized message passing.

**Key Features:**
- ✅ Modal interface (centered, 85vw × 88vh on desktop)
- ✅ Automatic theme synchronization (dark/light mode)
- ✅ User context passing (userId, conversationId)
- ✅ Success/error notifications via toasts
- ✅ Mobile-responsive (full-screen on mobile)
- ✅ Accessible (keyboard navigation, screen readers)
- ✅ Zero backend dependencies

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────┐
│  LibreChat (Parent Window)                 │
│                                             │
│  ┌───────────────────────────────────────┐ │
│  │  PDFBuilderModal (Radix Dialog)       │ │
│  │                                       │ │
│  │  ┌─────────────────────────────────┐ │ │
│  │  │  PDFBuilderIframe               │ │ │
│  │  │                                 │ │ │
│  │  │  postMessage API               │ │ │
│  │  │  ↕️                              │ │ │
│  │  │  PDF Builder App (iframe)      │ │ │
│  │  │                                 │ │ │
│  │  └─────────────────────────────────┘ │ │
│  └───────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

---

## 📦 Components

### 1. **PDFBuilderModal.tsx**
Main modal container using Radix Dialog.

**Responsibilities:**
- Render modal with backdrop
- Handle open/close state
- Connect to user, theme, and conversation contexts
- Display success/error toasts
- Lock body scroll when open

**Props:** None (controlled via Recoil state)

---

### 2. **PDFBuilderIframe.tsx**
Iframe component with postMessage communication.

**Responsibilities:**
- Render iframe with PDF Builder URL
- Send/receive postMessage events
- Handle theme synchronization
- Manage iframe ready state
- Display loading spinner

**Props:**
```typescript
interface PDFBuilderIframeProps {
  url: string;                    // PDF Builder URL
  userId: string;                 // Current user ID
  conversationId: string | null;  // Current conversation ID
  theme: 'dark' | 'light';        // Current theme
  templateHint?: string;          // Optional template pre-selection
  onReady?: () => void;
  onPDFGenerated?: (payload: PDFGeneratedPayload) => void;
  onError?: (payload: ErrorPayload) => void;
  onClose?: () => void;
}
```

---

### 3. **PDFBuilderTrigger.tsx**
Button to open the modal (placed in navigation bar).

**Responsibilities:**
- Render button with icon + label
- Open modal on click
- Show tooltip on hover
- Accessible (keyboard, screen reader)

**Props:** None (opens modal via Recoil state)

---

## 🔄 Message Flow

### Messages FROM PDF Builder (Received)

| Message Type | When Sent | Payload |
|-------------|-----------|---------|
| `LOAD` | Iframe starts loading | None |
| `READY` | Iframe fully loaded | None |
| `GET_THEME` | Requesting current theme | None |
| `PDF_GENERATED` | PDF successfully created | `{ pdfUrl, jobId, templateName, copies }` |
| `ERROR` | Error occurred | `{ message, context? }` |
| `CLOSE` | User clicked close | None |

### Messages TO PDF Builder (Sent)

| Message Type | When Sent | Payload |
|-------------|-----------|---------|
| `INIT` | After receiving `READY` | `{ userId, conversationId, templateHint? }` |
| `THEME_CHANGE` | Theme changes or after `GET_THEME` | `{ theme: 'dark' \| 'light' }` |

---

## 🎯 Usage

### For Users

1. **Open PDF Builder:**
   - Click the 📄 "PDF Builder" button in the top navigation bar (mobile)

2. **Generate PDF:**
   - Select template in the iframe
   - Fill in required fields
   - Click generate
   - Wait for success notification

3. **Download PDF:**
   - Click "Download PDF" in the success toast
   - Or get URL from the notification

4. **Close:**
   - Click × button in modal header
   - Or press ESC key

---

### For Developers

#### Opening the Modal Programmatically

```typescript
import { useSetRecoilState } from 'recoil';
import { pdfBuilderState } from '~/store/pdfBuilder';

function MyComponent() {
  const setPDFBuilder = useSetRecoilState(pdfBuilderState);
  
  const openPDFBuilder = () => {
    setPDFBuilder(prev => ({ ...prev, isOpen: true }));
  };
  
  return <button onClick={openPDFBuilder}>Open PDF Builder</button>;
}
```

#### Listening to PDF Generation Events

The modal automatically shows a toast notification when a PDF is generated. To add custom logic:

```typescript
// Modify PDFBuilderModal.tsx handlePDFGenerated function
const handlePDFGenerated = (payload: PDFGeneratedPayload) => {
  console.log('PDF URL:', payload.pdfUrl);
  console.log('Job ID:', payload.jobId);
  
  // Custom logic here
  // e.g., Save to conversation, trigger download, etc.
  
  showToast({
    message: 'PDF Generated Successfully!',
    status: 'success',
  });
};
```

#### Accessing Last Generated PDF

```typescript
import { useRecoilValue } from 'recoil';
import { pdfBuilderState } from '~/store/pdfBuilder';

function MyComponent() {
  const { lastGeneratedPDF } = useRecoilValue(pdfBuilderState);
  
  if (lastGeneratedPDF) {
    console.log('Last PDF URL:', lastGeneratedPDF.url);
    console.log('Generated at:', new Date(lastGeneratedPDF.timestamp));
  }
}
```

---

## ⚙️ Configuration

### Environment Variables

Add to your `.env` file:

```bash
# PDF Builder URL (required)
VITE_PDF_BUILDER_URL=https://client.dev.scaffad.cloud.jamot.pro/
```

**Default:** If not set, defaults to `https://client.dev.scaffad.cloud.jamot.pro/`

---

## 🎨 Styling

### Modal Dimensions

**Desktop:**
```css
width: 85vw;
max-width: 1400px;
height: 88vh;
max-height: 900px;
```

**Mobile:**
```css
width: 100vw;
height: 100vh;
border-radius: 0;
```

### Theme Variables

The modal automatically adapts to LibreChat's theme:

- **Dark Mode:** `dark:bg-gray-900`, `dark:border-gray-700`
- **Light Mode:** `bg-white`, `border-gray-200`

Theme changes are automatically synced to the iframe via `THEME_CHANGE` message.

---

## 🔒 Security

### Origin Validation

In production, uncomment origin validation in `PDFBuilderIframe.tsx`:

```typescript
const handleMessage = (event: MessageEvent) => {
  // SECURITY: Validate origin
  const expectedOrigin = new URL(url).origin;
  if (event.origin !== expectedOrigin) {
    console.warn('Rejected message from unauthorized origin:', event.origin);
    return;
  }
  
  // Process message...
};
```

### Content Security Policy

Ensure your CSP allows the PDF Builder iframe:

```
frame-src https://client.dev.scaffad.cloud.jamot.pro;
```

---

## 🧪 Testing

### Manual Testing Checklist

**Modal Functionality:**
- [ ] Modal opens when clicking trigger button
- [ ] Modal closes with × button
- [ ] Modal closes with ESC key
- [ ] Backdrop does NOT close modal (click ignored)
- [ ] Body scroll locked when modal open
- [ ] Modal centered on screen

**Iframe Communication:**
- [ ] Iframe loads successfully
- [ ] `READY` event received
- [ ] `INIT` message sent with correct data
- [ ] Theme syncs correctly
- [ ] Theme toggle propagates to iframe

**PDF Generation:**
- [ ] User can generate PDF
- [ ] `PDF_GENERATED` event received
- [ ] Success toast appears
- [ ] Download link works
- [ ] Last PDF saved to Recoil state

**Error Handling:**
- [ ] `ERROR` event shows error toast
- [ ] Errors logged to console
- [ ] Modal remains functional after error

**Responsive:**
- [ ] Desktop: 85vw × 88vh
- [ ] Mobile: Full-screen
- [ ] Button label hides on mobile

**Accessibility:**
- [ ] Focus trapped in modal
- [ ] ESC key closes modal
- [ ] Close button keyboard accessible
- [ ] aria-labels present

---

## 🐛 Troubleshooting

### Modal doesn't open
**Check:**
- Recoil state is updating (`isOpen: true`)
- `PDFBuilderModal` is rendered in Root layout
- No console errors

### Iframe shows blank
**Check:**
- `VITE_PDF_BUILDER_URL` is correct
- URL is accessible (try opening directly)
- Network tab for CORS/CSP errors
- Browser console for errors

### Messages not received
**Check:**
- `window.addEventListener('message')` is set up
- Message format matches expected structure
- Origin validation (if enabled) isn't rejecting messages
- Console logs to see all incoming messages

### Theme not syncing
**Check:**
- `useTheme()` hook is working
- `THEME_CHANGE` message is sent
- Theme value in `useEffect` dependency array
- Iframe is ready before sending theme

### PDF download doesn't work
**Check:**
- `pdfUrl` is valid
- CORS allows download
- Browser isn't blocking popup/download
- Try opening URL directly in new tab

---

## 📚 API Reference

### Recoil State

```typescript
// State atom
import { pdfBuilderState } from '~/store/pdfBuilder';

// State shape
interface PDFBuilderState {
  isOpen: boolean;
  isReady: boolean;
  isGenerating: boolean;
  lastGeneratedPDF: {
    url: string;
    jobId: string;
    templateName: string;
    timestamp: number;
  } | null;
}

// Usage
const state = useRecoilValue(pdfBuilderState);
const setState = useSetRecoilState(pdfBuilderState);
```

### TypeScript Types

```typescript
import type {
  PDFBuilderMessageType,
  PDFGeneratedPayload,
  ErrorPayload,
  InitPayload,
  ThemeChangePayload,
} from '~/components/PDFBuilder';
```

---

## 🚀 Future Enhancements

Potential improvements (not yet implemented):

1. **Message Context Menu** - Right-click message → "Create PDF"
2. **Slash Command** - `/pdf` to open modal
3. **Template Hints** - Pre-select template based on conversation
4. **PDF History** - List of previously generated PDFs
5. **Auto-Attach** - Attach PDF to conversation as file
6. **Backend Integration** - Save PDF metadata to MongoDB
7. **Minimize Feature** - Collapse modal to floating button
8. **Keyboard Shortcut** - `Cmd/Ctrl + Shift + P`
9. **Multi-Language** - Translate modal UI
10. **Analytics** - Track PDF generation events

---

## 📞 Support

**Issues:** If you encounter bugs or have questions:
1. Check the troubleshooting section above
2. Check browser console for errors
3. Verify environment variables are set
4. Test PDF Builder URL directly in browser

**File Structure:**
```
client/src/components/PDFBuilder/
├── PDFBuilderModal.tsx       # Main modal container
├── PDFBuilderIframe.tsx      # Iframe with postMessage
├── PDFBuilderTrigger.tsx     # Nav button trigger
├── types.ts                  # TypeScript definitions
├── index.ts                  # Exports
└── README.md                 # This file
```

---

**Version:** 1.0.0  
**Last Updated:** 2026-01-06  
**Dependencies:** React 18.2, Recoil, Radix Dialog, Framer Motion  
**Browser Support:** Chrome 90+, Firefox 88+, Safari 14+, Edge 90+
