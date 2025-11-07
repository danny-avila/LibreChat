# LibreChat Copilot JavaScript API Reference

Complete reference for the `window.LibreChat` JavaScript API used to control and interact with the copilot widget.

## Global Object: `window.LibreChat`

The copilot exposes all functionality through the global `window.LibreChat` object.

### Initialization

#### `LibreChat.init(config)`

Initialize the copilot widget with configuration options.

**Parameters:**

```typescript
interface CopilotConfig {
  // Required
  apiUrl: string;           // URL to LibreChat instance (e.g., "https://chat.example.com")
  assistant?: string;       // Assistant ID to use (default from server config)

  // Optional
  theme?: {
    primaryColor?: string;        // Hex color code (e.g., "#0066cc")
    primaryTextColor?: string;    // Text color on primary background
    bubbleBackgroundColor?: string;
    borderRadius?: number;        // CSS border-radius in pixels
    fontFamily?: string;          // CSS font-family value
  };

  branding?: {
    displayName?: string;   // Widget title displayed to user
    iconUrl?: string;       // URL to custom icon
  };

  behavior?: {
    position?: 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right' | 'center';
    width?: number;         // Widget width in pixels
    height?: number;        // Widget height in pixels
    persistentChat?: boolean; // Keep chat open across page navigation
    autoOpen?: boolean;     // Auto-open on first visit
  };

  auth?: {
    token?: string;         // JWT or session token for authenticated mode
    refreshToken?: string;  // Refresh token for session renewal
  };

  debug?: boolean;          // Enable console logging
}
```

**Example:**

```javascript
window.LibreChat.init({
  apiUrl: 'https://chat.example.com',
  assistant: 'support',
  theme: {
    primaryColor: '#0066cc'
  },
  branding: {
    displayName: 'Customer Support'
  }
});
```

### Messaging

#### `LibreChat.sendMessage(message)`

Send a message from the user to the copilot.

**Parameters:**
- `message` (string): The message to send

**Returns:** Promise that resolves when message is sent

**Example:**

```javascript
LibreChat.sendMessage('Hello, I need help with my order').then(() => {
  console.log('Message sent');
});
```

#### `LibreChat.getHistory()`

Retrieve the current conversation history.

**Returns:** Array of message objects

**Message Object Structure:**

```typescript
interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  metadata?: {
    sources?: Array<{id: string; title: string; url?: string}>;
    toolCalls?: Array<{name: string; status: 'pending' | 'success' | 'error'}>;
  };
}
```

**Example:**

```javascript
const history = LibreChat.getHistory();
console.log(`${history.length} messages in conversation`);

history.forEach(msg => {
  console.log(`[${msg.role}]: ${msg.content}`);
});
```

#### `LibreChat.clearHistory()`

Clear the current conversation history.

**Returns:** Promise

**Example:**

```javascript
LibreChat.clearHistory().then(() => {
  console.log('Conversation cleared');
});
```

### Widget Control

#### `LibreChat.open()`

Open the copilot widget if closed.

**Example:**

```javascript
LibreChat.open();
```

#### `LibreChat.close()`

Close the copilot widget if open.

**Example:**

```javascript
LibreChat.close();
```

#### `LibreChat.toggle()`

Toggle the copilot widget open/closed.

**Example:**

```javascript
const button = document.getElementById('toggle-copilot');
button.addEventListener('click', () => {
  LibreChat.toggle();
});
```

#### `LibreChat.isOpen()`

Check if the widget is currently open.

**Returns:** boolean

**Example:**

```javascript
if (LibreChat.isOpen()) {
  console.log('Copilot is open');
} else {
  LibreChat.open();
}
```

### Context Management

#### `LibreChat.setContext(context)`

Set contextual information to pass to the assistant. This data is included in the system prompt to give the AI better understanding of the user's situation.

**Parameters:**

```typescript
interface Context {
  // User information
  userId?: string;
  userName?: string;
  userEmail?: string;
  userRole?: string;

  // Page/App context
  currentPage?: string;
  pageTitle?: string;
  pageUrl?: string;

  // Domain-specific context (flexible)
  [key: string]: any;
}
```

**Example:**

```javascript
LibreChat.setContext({
  userId: 'user123',
  userName: 'John Doe',
  userEmail: 'john@example.com',
  currentPage: '/products/laptop-123',
  pageTitle: 'Premium Laptop',
  orderId: 'ORD-12345',
  cartTotal: '€129.99'
});
```

#### `LibreChat.getContext()`

Retrieve the currently set context.

**Returns:** Object with current context

**Example:**

```javascript
const context = LibreChat.getContext();
console.log('Current customer ID:', context.userId);
```

#### `LibreChat.clearContext()`

Clear all previously set context.

**Example:**

```javascript
LibreChat.clearContext();
```

### Event Listeners

#### `LibreChat.on(eventName, callback)`

Register an event listener.

**Events:**

##### `message`
Fired when a new message is sent or received.

```javascript
LibreChat.on('message', (message) => {
  console.log(`[${message.role}]: ${message.content}`);

  if (message.role === 'assistant') {
    console.log('AI is thinking...');
  }
});
```

##### `ready`
Fired when copilot is initialized and ready.

```javascript
LibreChat.on('ready', () => {
  console.log('Copilot initialized');
  // Now safe to call other methods
  LibreChat.setContext({ userId: '123' });
});
```

##### `error`
Fired when an error occurs.

```javascript
LibreChat.on('error', (error) => {
  console.error('Copilot error:', error);

  if (error.code === 'ASSISTANT_NOT_FOUND') {
    console.log('Assistant does not exist');
  }
});
```

##### `widget-open`
Fired when widget is opened.

```javascript
LibreChat.on('widget-open', () => {
  console.log('Widget opened');
});
```

##### `widget-close`
Fired when widget is closed.

```javascript
LibreChat.on('widget-close', () => {
  console.log('Widget closed');
});
```

##### `conversation-cleared`
Fired when conversation history is cleared.

```javascript
LibreChat.on('conversation-cleared', () => {
  console.log('History cleared');
});
```

##### `context-updated`
Fired when context is updated.

```javascript
LibreChat.on('context-updated', (context) => {
  console.log('Context updated:', context);
});
```

##### `tool-call`
Fired when assistant wants to call a tool/action.

```javascript
LibreChat.on('tool-call', (toolName, args) => {
  console.log(`Tool called: ${toolName}`, args);

  // Handle specific tools
  if (toolName === 'get-user-orders') {
    // Return data to copilot
    return fetch(`/api/users/${args.userId}/orders`)
      .then(r => r.json());
  }
});
```

##### `state-change`
Fired when widget state changes.

```javascript
LibreChat.on('state-change', (newState, prevState) => {
  console.log(`State changed from ${prevState} to ${newState}`);
});
```

#### `LibreChat.off(eventName, callback)`

Remove an event listener.

**Example:**

```javascript
const handler = () => console.log('Message received');
LibreChat.on('message', handler);

// Later, remove listener
LibreChat.off('message', handler);
```

### Configuration

#### `LibreChat.getConfig()`

Get the current configuration.

**Returns:** Configuration object

**Example:**

```javascript
const config = LibreChat.getConfig();
console.log('API URL:', config.apiUrl);
console.log('Assistant:', config.assistant);
```

#### `LibreChat.setConfig(config)`

Update configuration at runtime.

**Parameters:** Partial configuration object (same as `init`)

**Example:**

```javascript
LibreChat.setConfig({
  theme: {
    primaryColor: '#ff6b35'
  }
});
```

### Conversation Management

#### `LibreChat.saveConversation()`

Save the current conversation to local storage.

**Returns:** Promise<string> (conversation ID)

**Example:**

```javascript
LibreChat.saveConversation().then(conversationId => {
  console.log('Saved conversation:', conversationId);
});
```

#### `LibreChat.loadConversation(conversationId)`

Load a previously saved conversation.

**Parameters:**
- `conversationId` (string): ID of conversation to load

**Returns:** Promise

**Example:**

```javascript
LibreChat.loadConversation('conv_abc123').then(() => {
  console.log('Conversation loaded');
});
```

#### `LibreChat.listConversations()`

List all saved conversations.

**Returns:** Array of conversation metadata

**Example:**

```javascript
const conversations = LibreChat.listConversations();
conversations.forEach(conv => {
  console.log(`${conv.id}: ${conv.title} (${conv.messageCount} messages)`);
});
```

### Status & Health

#### `LibreChat.isReady()`

Check if copilot is ready for use.

**Returns:** boolean

**Example:**

```javascript
if (!LibreChat.isReady()) {
  LibreChat.on('ready', () => {
    // Now safe to use
  });
}
```

#### `LibreChat.getStatus()`

Get detailed status information.

**Returns:** Status object

```typescript
interface Status {
  ready: boolean;
  connected: boolean;
  loading: boolean;
  error?: string;
  assistant?: {
    id: string;
    name: string;
    isPublic: boolean;
  };
}
```

**Example:**

```javascript
const status = LibreChat.getStatus();
console.log('Ready:', status.ready);
console.log('Connected:', status.connected);
console.log('Assistant:', status.assistant.name);
```

### Advanced: Custom Styling

#### `LibreChat.setCSS(variables)`

Set custom CSS variables for theming.

**Parameters:** Object with CSS variable names and values

**Example:**

```javascript
LibreChat.setCSS({
  '--librechat-primary': '#0066cc',
  '--librechat-primary-text': '#ffffff',
  '--librechat-border-radius': '8px',
  '--librechat-shadow': '0 4px 12px rgba(0,0,0,0.1)'
});
```

### Cleanup

#### `LibreChat.destroy()`

Completely remove and cleanup the copilot widget.

**Returns:** Promise

**Example:**

```javascript
LibreChat.destroy().then(() => {
  console.log('Copilot removed');
});
```

---

## Complete Example

Here's a comprehensive example showing common usage patterns:

```html
<!DOCTYPE html>
<html>
<head>
  <title>My Store with Copilot</title>
</head>
<body>
  <h1>Welcome to My Store</h1>

  <!-- Copilot widget will appear here -->

  <script src="https://chat.example.com/embed/copilot.js" async></script>
  <script>
    // Wait for copilot to be ready
    document.addEventListener('DOMContentLoaded', function() {
      // Initialize
      LibreChat.init({
        apiUrl: 'https://chat.example.com',
        assistant: 'store-support',
        theme: {
          primaryColor: '#0066cc'
        },
        branding: {
          displayName: 'Store Support'
        }
      });

      // Listen for ready event
      LibreChat.on('ready', function() {
        console.log('Copilot ready!');

        // Set user context if logged in
        if (window.currentUser) {
          LibreChat.setContext({
            userId: currentUser.id,
            userName: currentUser.name,
            userEmail: currentUser.email
          });
        }
      });

      // Handle messages
      LibreChat.on('message', function(message) {
        if (message.role === 'user') {
          console.log('User sent:', message.content);
        } else {
          console.log('Assistant replied:', message.content);
        }
      });

      // Handle errors
      LibreChat.on('error', function(error) {
        console.error('Copilot error:', error);
      });

      // Auto-open on product page
      if (window.location.pathname.includes('/products/')) {
        LibreChat.open();
      }
    });

    // Track page changes and update context
    window.addEventListener('popstate', function() {
      LibreChat.setContext({
        currentPage: window.location.pathname,
        pageTitle: document.title
      });
    });
  </script>
</body>
</html>
```

---

## Error Handling

Common error codes returned in `error` events:

- `ASSISTANT_NOT_FOUND` - Specified assistant doesn't exist
- `API_UNREACHABLE` - Cannot connect to LibreChat API
- `AUTH_REQUIRED` - Authentication needed but not provided
- `INVALID_TOKEN` - Authentication token is invalid/expired
- `RATE_LIMITED` - Too many requests
- `UNKNOWN_ERROR` - Unexpected error occurred

---

## Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Mobile browsers (iOS Safari, Chrome Mobile)

---

## Performance Tips

1. **Lazy load**: Only initialize copilot on pages where it's needed
2. **Debounce context updates**: Don't call `setContext` more than once per second
3. **Use persistent chat**: Keep widget open across pages to avoid re-initializing
4. **Monitor memory**: Clear history periodically on long-lived pages

---

## Debugging

Enable debug mode:

```javascript
LibreChat.init({
  apiUrl: 'https://chat.example.com',
  debug: true  // Logs all API calls to console
});
```

---

**Last Updated**: 2025-11-07
**Version**: 1.0
