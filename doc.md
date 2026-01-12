# PDF Builder Iframe Integration Guide (React)

This guide explains how to embed the PDF Builder application into your React frontend using an iframe and communicate with it via the postMessage API.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Understanding the Basics](#understanding-the-basics)
  - [What is an iframe?](#what-is-an-iframe)
  - [What is postMessage?](#what-is-postmessage)
  - [What is a React ref?](#what-is-a-react-ref)
- [Step 1: Setting Up the Iframe](#step-1-setting-up-the-iframe)
- [Step 2: Creating a Ref to Access the Iframe](#step-2-creating-a-ref-to-access-the-iframe)
- [Step 3: Listening for Messages (Receiving)](#step-3-listening-for-messages-receiving)
- [Step 4: Sending Messages to the Iframe](#step-4-sending-messages-to-the-iframe)
- [Message Types Reference](#message-types-reference)
- [Theme Synchronization](#theme-synchronization)
- [Complete Working Example](#complete-working-example)
- [TypeScript Definitions](#typescript-definitions)
- [Common Mistakes to Avoid](#common-mistakes-to-avoid)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

- Basic knowledge of React (components, hooks, JSX)
- React 16.8+ (for hooks support)
- A running PDF Builder instance URL

---

## Understanding the Basics

Before we dive into the code, let's understand the key concepts.

### What is an iframe?

An iframe (inline frame) is an HTML element that embeds another webpage inside your page. Think of it as a "window" into another website within your app.

```tsx
// This embeds the PDF Builder app inside your React app
<iframe src="https://pdf-builder.example.com" />
```

The iframe runs in its own isolated environment. Your React app and the iframe cannot directly access each other's JavaScript variables or DOM - they are separate worlds. To communicate between them, we use `postMessage`.

### What is postMessage?

`postMessage` is a browser API that allows safe communication between different windows (including iframes). It works like sending letters:

- **Sending a message**: You call `postMessage()` on the target window
- **Receiving a message**: You listen for the `"message"` event on your window

```
Your React App                         PDF Builder (iframe)
     |                                        |
     |  ---- postMessage (INIT) ---->         |  You send a message
     |                                        |
     |  <--- postMessage (READY) ----         |  Iframe sends back
     |                                        |
```

### What is a React ref?

A ref (reference) is React's way of getting direct access to a DOM element. Normally in React, you work with state and props, not DOM elements directly. But to send messages to an iframe, we need access to the actual `<iframe>` DOM element.

```tsx
import { useRef } from 'react';

function MyComponent() {
  // Create a ref - think of it as a "container" that will hold the DOM element
  const iframeRef = useRef<HTMLIFrameElement>(null);
  
  // Attach the ref to the iframe element
  return <iframe ref={iframeRef} src="..." />;
  
  // Now iframeRef.current points to the actual <iframe> DOM element
  // iframeRef.current.contentWindow gives us access to the iframe's window
}
```

**Key points about refs:**
- `useRef()` creates the ref container
- `ref={iframeRef}` attaches it to the element
- `iframeRef.current` contains the actual DOM element (or `null` if not mounted yet)
- `iframeRef.current.contentWindow` is the iframe's window object (needed for postMessage)

---

## Step 1: Setting Up the Iframe

First, let's add the iframe to your component:

```tsx
function PDFBuilderEmbed() {
  return (
    <div style={{ width: '100%', height: '600px' }}>
      <iframe
        src="https://your-pdf-builder-url.com"
        style={{ width: '100%', height: '100%', border: 'none' }}
        allow="clipboard-write"
        title="PDF Builder"
      />
    </div>
  );
}
```

**Important iframe attributes:**
| Attribute | Purpose |
|-----------|---------|
| `src` | The URL of the PDF Builder application |
| `allow="clipboard-write"` | Lets the iframe use the clipboard (for copy/paste) |
| `title` | Accessibility label (screen readers use this) |

---

## Step 2: Creating a Ref to Access the Iframe

To send messages to the iframe, we need a reference to it:

```tsx
import { useRef } from 'react';

function PDFBuilderEmbed() {
  // Step 1: Create a ref to hold the iframe element
  const iframeRef = useRef<HTMLIFrameElement>(null);
  
  return (
    <div style={{ width: '100%', height: '600px' }}>
      {/* Step 2: Attach the ref to the iframe */}
      <iframe
        ref={iframeRef}
        src="https://your-pdf-builder-url.com"
        style={{ width: '100%', height: '100%', border: 'none' }}
        allow="clipboard-write"
        title="PDF Builder"
      />
    </div>
  );
}
```

**What's happening here:**
1. `useRef<HTMLIFrameElement>(null)` creates a ref that will hold an iframe element
2. `ref={iframeRef}` tells React to put the iframe element into our ref
3. After the component mounts, `iframeRef.current` will be the iframe element
4. `iframeRef.current.contentWindow` will be the iframe's window (for sending messages)

---

## Step 3: Listening for Messages (Receiving)

The PDF Builder iframe sends messages to tell your app what's happening. You need to listen for these messages using `window.addEventListener`.

```tsx
import { useRef, useEffect } from 'react';

function PDFBuilderEmbed() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  
  // Set up message listener when component mounts
  useEffect(() => {
    // This function runs whenever a message is received
    const handleMessage = (event: MessageEvent) => {
      // The message data is in event.data
      const { type, payload } = event.data;
      
      console.log('Received message from iframe:', type, payload);
      
      // Handle different message types
      switch (type) {
        case 'LOAD':
          console.log('PDF Builder is loading...');
          break;
          
        case 'READY':
          console.log('PDF Builder is ready!');
          // Now it's safe to send messages to the iframe
          break;
          
        case 'PDF_GENERATED':
          console.log('PDF was generated!', payload);
          // payload contains: { pdfUrl, jobId, templateName, copies }
          break;
          
        case 'ERROR':
          console.error('PDF Builder error:', payload.message);
          break;
          
        case 'CLOSE':
          console.log('User wants to close PDF Builder');
          break;
          
        case 'GET_THEME':
          console.log('PDF Builder is asking for the current theme');
          // You should respond with THEME_CHANGE message
          break;
      }
    };
    
    // Add the listener
    window.addEventListener('message', handleMessage);
    
    // Clean up: remove the listener when component unmounts
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, []); // Empty array = run once when component mounts
  
  return (
    <iframe
      ref={iframeRef}
      src="https://your-pdf-builder-url.com"
      style={{ width: '100%', height: '100%', border: 'none' }}
      allow="clipboard-write"
      title="PDF Builder"
    />
  );
}
```

**Understanding the useEffect:**

```tsx
useEffect(() => {
  // This code runs AFTER the component renders
  
  const handleMessage = (event: MessageEvent) => {
    // Process incoming messages
  };
  
  // Start listening for messages
  window.addEventListener('message', handleMessage);
  
  // This cleanup function runs when:
  // 1. The component unmounts (is removed from the page)
  // 2. Before the effect runs again (if dependencies change)
  return () => {
    window.removeEventListener('message', handleMessage);
  };
}, []);
```

**Why cleanup matters:** Without removing the listener, you'd add a new listener every time the component re-renders, causing memory leaks and duplicate message handling.

---

## Step 4: Sending Messages to the Iframe

To send a message to the iframe, use the `postMessage` method on the iframe's window:

```tsx
import { useRef, useEffect, useState } from 'react';

function PDFBuilderEmbed() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isReady, setIsReady] = useState(false);
  
  // Function to send a message to the iframe
  const sendMessageToIframe = (type: string, payload?: any) => {
    // Safety check: make sure the ref and contentWindow exist
    if (iframeRef.current && iframeRef.current.contentWindow) {
      // Send the message
      iframeRef.current.contentWindow.postMessage(
        { type, payload },  // The message data
        '*'                 // Target origin ('*' means any origin)
      );
      console.log('Sent message to iframe:', type, payload);
    } else {
      console.warn('Cannot send message: iframe not ready');
    }
  };
  
  // Listen for messages
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const { type, payload } = event.data;
      
      switch (type) {
        case 'READY':
          setIsReady(true);
          // Iframe is ready - send initialization data
          sendMessageToIframe('INIT', {
            userId: 'user-123',
            conversationId: 'conv-456',
          });
          break;
          
        case 'GET_THEME':
          // Iframe is asking for the theme
          sendMessageToIframe('THEME_CHANGE', { theme: 'dark' });
          break;
          
        case 'PDF_GENERATED':
          console.log('PDF URL:', payload.pdfUrl);
          break;
      }
    };
    
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);
  
  return (
    <div>
      <div>Status: {isReady ? 'Ready' : 'Loading...'}</div>
      <iframe
        ref={iframeRef}
        src="https://your-pdf-builder-url.com"
        style={{ width: '100%', height: '600px', border: 'none' }}
        allow="clipboard-write"
        title="PDF Builder"
      />
    </div>
  );
}
```

**Breaking down `postMessage`:**

```tsx
iframeRef.current.contentWindow.postMessage(
  { type, payload },  // Message data (can be any JSON-serializable object)
  '*'                 // Target origin
);
```

- `iframeRef.current` - The iframe DOM element
- `.contentWindow` - The window object inside the iframe
- `.postMessage(data, origin)` - Sends a message
  - `data` - The message content (we use `{ type, payload }` format)
  - `origin` - Security: which origins can receive this message
    - `'*'` means any origin (OK for development)
    - In production, use the actual URL: `'https://pdf-builder.example.com'`

---

## Message Types Reference

### Messages FROM PDF Builder (you receive these)

| Type | When it's sent | Payload |
|------|----------------|---------|
| `LOAD` | Iframe starts loading | None |
| `READY` | Iframe is fully loaded and ready | None |
| `PDF_GENERATED` | User generated a PDF | `{ pdfUrl, jobId, templateName, copies }` |
| `ERROR` | An error occurred | `{ message, context? }` |
| `CLOSE` | User clicked close/exit | None |
| `GET_THEME` | Iframe wants to know the current theme | None |

### Messages TO PDF Builder (you send these)

| Type | When to send it | Payload |
|------|-----------------|---------|
| `INIT` | After receiving `READY` | `{ userId, conversationId, templateHint? }` |
| `CLOSE` | When you want to close/reset the iframe | None |
| `THEME_CHANGE` | When theme changes or after `GET_THEME` | `{ theme: 'dark' \| 'light' }` |

---

## Theme Synchronization

PDF Builder supports dark and light themes. Here's how to keep it in sync with your app:

```tsx
import { useRef, useEffect, useState } from 'react';

function PDFBuilderEmbed() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [isIframeReady, setIsIframeReady] = useState(false);
  
  // Helper function to send messages
  const sendToIframe = (type: string, payload?: any) => {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage({ type, payload }, '*');
    }
  };
  
  // Listen for messages from iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const { type } = event.data;
      
      if (type === 'READY') {
        setIsIframeReady(true);
      }
      
      if (type === 'GET_THEME') {
        // Iframe is asking for the theme - send it
        sendToIframe('THEME_CHANGE', { 
          theme: isDarkMode ? 'dark' : 'light' 
        });
      }
    };
    
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [isDarkMode]); // Re-run when isDarkMode changes
  
  // Send theme to iframe whenever it changes
  useEffect(() => {
    if (isIframeReady) {
      sendToIframe('THEME_CHANGE', { 
        theme: isDarkMode ? 'dark' : 'light' 
      });
    }
  }, [isDarkMode, isIframeReady]);
  
  // Toggle theme function
  const toggleTheme = () => {
    setIsDarkMode(prev => !prev);
  };
  
  return (
    <div>
      <button onClick={toggleTheme}>
        Switch to {isDarkMode ? 'Light' : 'Dark'} Mode
      </button>
      <iframe
        ref={iframeRef}
        src="https://your-pdf-builder-url.com"
        style={{ width: '100%', height: '600px', border: 'none' }}
        allow="clipboard-write"
        title="PDF Builder"
      />
    </div>
  );
}
```

**Theme sync flow:**

```
1. Your app loads with isDarkMode = true
2. Iframe loads and sends GET_THEME
3. You receive GET_THEME and send THEME_CHANGE { theme: 'dark' }
4. User clicks theme toggle, isDarkMode becomes false
5. useEffect detects change and sends THEME_CHANGE { theme: 'light' }
6. Iframe updates its theme
```

---

## Complete Working Example

Here's a complete, production-ready component:

```tsx
import { useRef, useEffect, useState, useCallback } from 'react';

// ============================================
// TYPE DEFINITIONS
// ============================================

type MessageType = 
  | 'LOAD' 
  | 'READY' 
  | 'PDF_GENERATED' 
  | 'ERROR' 
  | 'CLOSE' 
  | 'INIT' 
  | 'GET_THEME' 
  | 'THEME_CHANGE';

interface PDFGeneratedPayload {
  pdfUrl: string;
  jobId: string;
  templateName: string;
  copies: number;
}

interface ErrorPayload {
  message: string;
  context?: string;
}

interface PDFBuilderProps {
  /** URL where PDF Builder is hosted */
  url: string;
  /** Current user's ID */
  userId: string;
  /** Current conversation/session ID */
  conversationId: string;
  /** Current theme */
  theme: 'dark' | 'light';
  /** Optional: pre-select a template */
  templateHint?: string;
  /** Callback when PDF is generated */
  onPDFGenerated?: (payload: PDFGeneratedPayload) => void;
  /** Callback when an error occurs */
  onError?: (payload: ErrorPayload) => void;
  /** Callback when user requests to close */
  onClose?: () => void;
  /** Callback when iframe becomes ready */
  onReady?: () => void;
}

// ============================================
// COMPONENT
// ============================================

export function PDFBuilder({
  url,
  userId,
  conversationId,
  theme,
  templateHint,
  onPDFGenerated,
  onError,
  onClose,
  onReady,
}: PDFBuilderProps) {
  // Ref to access the iframe DOM element
  const iframeRef = useRef<HTMLIFrameElement>(null);
  
  // Track if iframe is ready to receive messages
  const [isReady, setIsReady] = useState(false);

  // ----------------------------------------
  // SENDING MESSAGES
  // ----------------------------------------
  
  /**
   * Send a message to the PDF Builder iframe.
   * 
   * Uses useCallback so we can safely include it in useEffect dependencies.
   * The function is memoized and only recreated if 'url' changes.
   */
  const sendMessage = useCallback((type: MessageType, payload?: any) => {
    // Check if iframe ref exists and has a contentWindow
    if (!iframeRef.current) {
      console.warn('sendMessage: iframe ref is null');
      return;
    }
    
    if (!iframeRef.current.contentWindow) {
      console.warn('sendMessage: iframe contentWindow is null');
      return;
    }
    
    // Send the message to the iframe
    iframeRef.current.contentWindow.postMessage(
      { type, payload },
      url  // Target origin for security (use '*' only in development)
    );
    
    console.log(`[PDFBuilder] Sent: ${type}`, payload);
  }, [url]);

  // ----------------------------------------
  // RECEIVING MESSAGES
  // ----------------------------------------
  
  useEffect(() => {
    /**
     * Handle incoming messages from the iframe.
     */
    const handleMessage = (event: MessageEvent) => {
      // SECURITY: Validate the message origin in production
      // Uncomment this for production:
      // if (event.origin !== url) {
      //   console.warn('Ignored message from unknown origin:', event.origin);
      //   return;
      // }
      
      // Ignore messages that don't have our expected format
      if (!event.data || typeof event.data.type !== 'string') {
        return;
      }

      const { type, payload } = event.data;
      
      console.log(`[PDFBuilder] Received: ${type}`, payload);

      // Handle each message type
      switch (type) {
        case 'LOAD':
          // Iframe started loading - nothing to do
          break;
          
        case 'READY':
          // Iframe is ready - send initialization data
          setIsReady(true);
          sendMessage('INIT', { 
            userId, 
            conversationId,
            templateHint,
          });
          onReady?.();
          break;
          
        case 'GET_THEME':
          // Iframe is requesting the current theme
          sendMessage('THEME_CHANGE', { theme });
          break;
          
        case 'PDF_GENERATED':
          // User successfully generated a PDF
          onPDFGenerated?.(payload as PDFGeneratedPayload);
          break;
          
        case 'ERROR':
          // An error occurred in PDF Builder
          onError?.(payload as ErrorPayload);
          break;
          
        case 'CLOSE':
          // User clicked close/exit button
          onClose?.();
          break;
      }
    };

    // Start listening for messages
    window.addEventListener('message', handleMessage);
    
    // Cleanup: stop listening when component unmounts
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [
    url, 
    userId, 
    conversationId, 
    templateHint, 
    theme, 
    sendMessage,
    onPDFGenerated, 
    onError, 
    onClose,
    onReady,
  ]);

  // ----------------------------------------
  // THEME SYNCHRONIZATION
  // ----------------------------------------
  
  /**
   * When theme changes, notify the iframe.
   * Only sends if iframe is ready.
   */
  useEffect(() => {
    if (isReady) {
      sendMessage('THEME_CHANGE', { theme });
    }
  }, [theme, isReady, sendMessage]);

  // ----------------------------------------
  // RENDER
  // ----------------------------------------
  
  return (
    <iframe
      ref={iframeRef}
      src={url}
      style={{
        width: '100%',
        height: '100%',
        border: 'none',
      }}
      allow="clipboard-write"
      title="PDF Builder"
    />
  );
}

// ============================================
// USAGE EXAMPLE
// ============================================

/*
function App() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  
  const handlePDFGenerated = (payload: PDFGeneratedPayload) => {
    console.log('PDF ready:', payload.pdfUrl);
    // Maybe show a download button or notification
  };
  
  const handleError = (payload: ErrorPayload) => {
    console.error('PDF Builder error:', payload.message);
    // Show an error toast/notification
  };
  
  const handleClose = () => {
    console.log('User closed PDF Builder');
    // Maybe navigate away or hide the component
  };

  return (
    <div style={{ width: '100%', height: '600px' }}>
      <PDFBuilder
        url={process.env.REACT_APP_PDF_BUILDER_URL!}
        userId="user-123"
        conversationId="conv-456"
        theme={theme}
        onPDFGenerated={handlePDFGenerated}
        onError={handleError}
        onClose={handleClose}
        onReady={() => console.log('PDF Builder is ready!')}
      />
    </div>
  );
}
*/
```

---

## TypeScript Definitions

Copy these types into your project:

```typescript
// types/pdf-builder.ts

export type PDFBuilderMessageType = 
  | 'LOAD' 
  | 'READY' 
  | 'PDF_GENERATED' 
  | 'ERROR' 
  | 'CLOSE' 
  | 'INIT' 
  | 'GET_THEME' 
  | 'THEME_CHANGE';

export interface PDFBuilderMessage {
  type: PDFBuilderMessageType;
  payload?: unknown;
}

export interface PDFGeneratedPayload {
  /** URL to download the generated PDF */
  pdfUrl: string;
  /** Unique identifier for this generation job */
  jobId: string;
  /** Name of the template used */
  templateName: string;
  /** Number of copies generated */
  copies: number;
}

export interface ErrorPayload {
  /** Human-readable error message */
  message: string;
  /** Additional context about the error */
  context?: string;
}

export interface InitPayload {
  /** Current user identifier */
  userId: string;
  /** Current conversation/session ID */
  conversationId: string;
  /** Optional: pre-select a specific template */
  templateHint?: string;
}

export interface ThemeChangePayload {
  theme: 'dark' | 'light';
}
```

---

## Common Mistakes to Avoid

### 1. Forgetting to check if ref exists

```tsx
// BAD - will crash if ref is null
iframeRef.current.contentWindow.postMessage(...);

// GOOD - safe check
if (iframeRef.current?.contentWindow) {
  iframeRef.current.contentWindow.postMessage(...);
}
```

### 2. Sending messages before iframe is ready

```tsx
// BAD - iframe might not be ready
useEffect(() => {
  sendMessage('INIT', { userId: '123' });
}, []);

// GOOD - wait for READY event
useEffect(() => {
  const handleMessage = (event: MessageEvent) => {
    if (event.data.type === 'READY') {
      sendMessage('INIT', { userId: '123' });
    }
  };
  window.addEventListener('message', handleMessage);
  return () => window.removeEventListener('message', handleMessage);
}, []);
```

### 3. Not cleaning up event listeners

```tsx
// BAD - memory leak, listeners pile up
useEffect(() => {
  window.addEventListener('message', handleMessage);
  // Missing cleanup!
});

// GOOD - cleanup on unmount
useEffect(() => {
  window.addEventListener('message', handleMessage);
  return () => window.removeEventListener('message', handleMessage);
}, []);
```

### 4. Using stale values in event handlers

```tsx
// BAD - theme will always be the initial value
const [theme, setTheme] = useState('dark');

useEffect(() => {
  const handleMessage = (event: MessageEvent) => {
    if (event.data.type === 'GET_THEME') {
      sendMessage('THEME_CHANGE', { theme }); // Stale!
    }
  };
  window.addEventListener('message', handleMessage);
  return () => window.removeEventListener('message', handleMessage);
}, []); // Empty deps = handler never updates

// GOOD - include theme in dependencies
useEffect(() => {
  const handleMessage = (event: MessageEvent) => {
    if (event.data.type === 'GET_THEME') {
      sendMessage('THEME_CHANGE', { theme }); // Fresh!
    }
  };
  window.addEventListener('message', handleMessage);
  return () => window.removeEventListener('message', handleMessage);
}, [theme]); // Re-creates handler when theme changes
```

---

## Troubleshooting

### "Cannot read property 'postMessage' of null"

**Cause:** Trying to send a message before the iframe is mounted or before `contentWindow` is available.

**Solution:** 
1. Check that `iframeRef.current` exists
2. Check that `iframeRef.current.contentWindow` exists
3. Wait for the `READY` event before sending messages

### Messages not being received

**Possible causes:**
1. Event listener not set up correctly
2. Message origin validation rejecting the message
3. Message format doesn't match what you're checking for

**Debug steps:**
```tsx
const handleMessage = (event: MessageEvent) => {
  // Log ALL incoming messages to see what's happening
  console.log('Raw message event:', event);
  console.log('Origin:', event.origin);
  console.log('Data:', event.data);
};
```

### Theme not syncing

**Checklist:**
1. Are you listening for `GET_THEME` and responding with `THEME_CHANGE`?
2. Is the iframe ready when you send the theme? (Check `isReady` state)
3. Is `theme` included in your `useEffect` dependencies?

### Iframe shows blank/white

**Possible causes:**
1. Wrong URL in `src`
2. CORS/CSP (Content Security Policy) blocking the iframe
3. PDF Builder server is down

**Check:** Open the iframe URL directly in a new browser tab to verify it loads.

---

## Demo Application

A working demo is available in the `demo-react/` directory:

```bash
cd demo-react
npm install
npm run dev
```

This demo shows all integration features including message handling and theme sync.
