# LibreChat Copilot Mode

## Overview

Copilot Mode transforms LibreChat into an embedded AI assistant that can be integrated into your website or application. Similar to [Chainlit's Copilot](https://docs.chainlit.io/deploy/copilot), this mode provides a lightweight chat interface that can be embedded directly in PrestaShop, TYPO3, or any modern website.

### Key Features

- **Lightweight Embedded Widget**: A single script tag adds the copilot to your website
- **Conversation Persistence**: Chat history is saved in browser localStorage
- **Customizable Styling**: Theme colors, branding, and UI elements can be configured
- **Two-Way Communication**: Website and copilot can exchange data and trigger actions
- **No Authentication Required**: Optional guest mode for public assistants
- **Responsive Design**: Works on desktop, tablet, and mobile devices

## Architecture

### Modes of Operation

LibreChat can operate in two configurations:

1. **Full Mode** (Default)
   - Complete interface with sidebar navigation
   - Multi-conversation support
   - Full agent/assistant management
   - Recommended for: Standalone chat applications, internal tools

2. **Copilot Mode** (New)
   - Simplified embedded widget
   - Single conversation focus
   - Floating button with chat window
   - Recommended for: Website integration, e-commerce, customer support

## Configuration

### Enable Copilot Mode

In `librechat.yaml`:

```yaml
interface:
  copilotMode:
    enabled: true
    # Copilot-specific settings
    defaultAssistant: "customer-support"  # Default agent/assistant to use
    theme:
      primaryColor: "#0066cc"
      primaryTextColor: "#ffffff"
      bubbleBackgroundColor: "#f0f0f0"
    branding:
      displayName: "My AI Assistant"
      iconUrl: "/images/copilot-icon.png"
      allowDarkMode: true
    behavior:
      position: "bottom-right"  # bottom-left, bottom-right, top-left, top-right
      persistentChat: true      # Keep chat window open across pages
      autoOpen: false           # Auto-open chat on first visit
      showOnPages: ["*"]        # Pages to show on: ["*"] for all, ["/products/*"] for specific
      hideOnPages: []           # Pages to hide on
    security:
      requireAuth: false        # Require user login
      allowedDomains: []        # CORS allowed domains (empty = all)
```

### Environment Variables

```env
# Copilot Mode Settings
COPILOT_MODE=true
COPILOT_API_URL=https://your-librechat-domain.com  # URL where copilot widget fetches data
COPILOT_EMBED_DOMAIN=https://embed.your-domain.com # Optional: separate domain for embed script

# Widget customization
COPILOT_WIDGET_WIDTH=400
COPILOT_WIDGET_HEIGHT=600
COPILOT_DEFAULT_ASSISTANT=customer-support
```

## Integration Guide

### Basic Integration

Add a single script tag to your website:

```html
<!DOCTYPE html>
<html>
<head>
    <title>My Store</title>
</head>
<body>
    <!-- Your page content -->

    <!-- Add copilot widget -->
    <script src="https://your-librechat-domain.com/embed/copilot.js"></script>
    <script>
        window.LibreChat.init({
            apiUrl: 'https://your-librechat-domain.com',
            assistant: 'customer-support',
            theme: {
                primaryColor: '#0066cc'
            }
        });
    </script>
</body>
</html>
```

### JavaScript API

The copilot exposes a global `window.LibreChat` object:

```javascript
// Initialize the copilot
LibreChat.init({
    apiUrl: 'https://your-librechat.com',
    assistant: 'support-agent',
    theme: { primaryColor: '#0066cc' }
});

// Send a message programmatically
LibreChat.sendMessage('Hello, I need help with order #123');

// Get conversation history
const history = LibreChat.getHistory();

// Clear conversation
LibreChat.clearHistory();

// Listen for events
LibreChat.on('message', (message) => {
    console.log('New message:', message);
});

LibreChat.on('ready', () => {
    console.log('Copilot is ready');
});

// Programmatically open/close
LibreChat.open();
LibreChat.close();
LibreChat.toggle();

// Send custom context to copilot
LibreChat.setContext({
    userId: user.id,
    userName: user.name,
    orderId: '12345',
    pageContext: 'product-page'
});
```

### Conversation Context

Pass additional context to the AI assistant:

```javascript
LibreChat.setContext({
    // User information (optional)
    userId: 'user123',
    userName: 'John Doe',
    userEmail: 'john@example.com',

    // Page/App context (optional)
    currentPage: '/products/laptop-123',
    pageTitle: 'Premium Laptop',

    // Domain-specific context
    orderId: 'ORD-12345',
    cartTotal: '€129.99',
    userLanguage: 'de'
});
```

This context is automatically included in the system prompt to give the AI better understanding of the user's situation.

---

## Platform-Specific Integration

### PrestaShop Integration

See **[COPILOT-PRESTASHOP.md](COPILOT-PRESTASHOP.md)** for detailed integration instructions.

**Quick Start:**

1. Create a new module or add to header theme file
2. Add the copilot script in footer
3. Customize for PrestaShop context (orders, products, customer data)
4. Test integration with live store

### TYPO3 Integration

See **[COPILOT-TYPO3.md](COPILOT-TYPO3.md)** for detailed integration instructions.

**Quick Start:**

1. Create a TYPO3 extension (recommended) or use custom content element
2. Add the copilot script to page template
3. Integrate with TYPO3 content and user context
4. Configure via TYPO3 backend

---

## Deployment

### Option 1: Same Domain

Host both LibreChat API and frontend on the same domain. Simplest setup.

```
https://your-site.com/
├── /api          → LibreChat backend
├── /chat         → LibreChat frontend (full mode)
└── /embed        → Copilot widget script
```

### Option 2: Separate Domains

Host LibreChat on a dedicated subdomain with proper CORS configuration.

```
https://your-site.com/
└── Any page → Can embed from https://chat.your-site.com/embed/copilot.js
```

Configure CORS in `.env`:

```env
COPILOT_ALLOWED_ORIGINS=["https://your-site.com", "https://shop.example.com"]
```

### Docker Deployment

Use the existing Docker setup with copilot mode enabled:

```bash
# Build and start
docker compose up -d

# The copilot widget is available at:
# https://your-librechat-domain.com/embed/copilot.js
```

---

## Configuration Examples

### Customer Support Assistant

```yaml
interface:
  copilotMode:
    enabled: true
    defaultAssistant: "customer-support"
    branding:
      displayName: "Customer Support"
      iconUrl: "/images/support-icon.png"
    behavior:
      position: "bottom-right"
      autoOpen: false
      showOnPages: ["/help/*", "/contact", "/faq"]
```

### Product Recommendation Copilot

```yaml
interface:
  copilotMode:
    enabled: true
    defaultAssistant: "product-advisor"
    theme:
      primaryColor: "#ff6b35"
    branding:
      displayName: "Find Your Perfect Product"
    behavior:
      position: "top-right"
      persistentChat: true
      showOnPages: ["/products/*", "/category/*"]
```

### Legal Document Assistant

```yaml
interface:
  copilotMode:
    enabled: true
    defaultAssistant: "legal-advisor"
    security:
      requireAuth: true  # Only authenticated users
    branding:
      displayName: "Legal Information Advisor"
    behavior:
      persistentChat: false  # Fresh conversation per page
```

---

## Advanced Features

### Custom Authentication

For private assistants, implement authentication:

```javascript
// On your website
const token = await fetch('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password })
}).then(r => r.json());

LibreChat.init({
    apiUrl: 'https://your-librechat.com',
    assistant: 'private-agent',
    auth: {
        token: token.access_token,
        refreshToken: token.refresh_token
    }
});
```

### Event Listeners

React to copilot events:

```javascript
// Message events
LibreChat.on('message', (message) => {
    console.log('User/AI message:', message);
});

// Error events
LibreChat.on('error', (error) => {
    console.error('Copilot error:', error);
});

// Ready event
LibreChat.on('ready', () => {
    console.log('Copilot initialized');
});

// Conversation events
LibreChat.on('conversation-cleared', () => {
    console.log('History cleared');
});
```

### Tool Integration

If your copilot uses MCP tools or custom actions:

```javascript
// Handle tool calls from the copilot
LibreChat.on('tool-call', (toolName, args) => {
    console.log(`Tool called: ${toolName}`, args);

    if (toolName === 'get-order-status') {
        // Fetch from your API
        return fetch(`/api/orders/${args.orderId}`)
            .then(r => r.json());
    }
});
```

---

## Styling & Customization

### CSS Variables

Override the copilot's default styling:

```html
<style>
    :root {
        --librechat-primary: #0066cc;
        --librechat-primary-text: #ffffff;
        --librechat-border-radius: 8px;
        --librechat-font-family: 'Inter', sans-serif;
        --librechat-shadow: 0 4px 12px rgba(0,0,0,0.1);
        --librechat-message-user-bg: #0066cc;
        --librechat-message-user-text: #ffffff;
        --librechat-message-assistant-bg: #f0f0f0;
        --librechat-message-assistant-text: #000000;
    }
</style>
```

### Custom CSS Class

The copilot widget element has specific classes:

```css
/* Widget container */
.librechat-copilot-widget {
    /* your styles */
}

/* Chat window */
.librechat-copilot-window {
    /* your styles */
}

/* Messages */
.librechat-message-user {
    /* user messages */
}

.librechat-message-assistant {
    /* assistant messages */
}
```

---

## Security Considerations

### CORS Configuration

By default, the copilot widget can be embedded on any domain. To restrict:

```env
COPILOT_ALLOWED_ORIGINS=["https://example.com", "https://shop.example.com"]
```

### API Key Security

Never expose your LibreChat admin API keys to the client:

```javascript
// ❌ DON'T DO THIS
LibreChat.init({
    apiUrl: 'https://your-librechat.com',
    apiKey: 'secret-admin-key'  // NEVER!
});

// ✅ DO THIS - Use public assistants or user auth tokens
LibreChat.init({
    apiUrl: 'https://your-librechat.com',
    assistant: 'public-customer-support'  // Public assistant
});
```

### Guest vs Authenticated Mode

```javascript
// Guest mode (no authentication)
LibreChat.init({
    assistant: 'public-help'  // Public assistant
});

// Authenticated mode
LibreChat.init({
    apiUrl: 'https://your-librechat.com',
    auth: {
        token: userToken  // From your auth system
    }
});
```

---

## Monitoring & Analytics

### Track Copilot Usage

```javascript
// Custom analytics integration
LibreChat.on('message', (message) => {
    // Send to your analytics service
    gtag('event', 'copilot_message', {
        message_type: message.role,
        length: message.content.length
    });
});

LibreChat.on('ready', () => {
    gtag('event', 'copilot_initialized');
});
```

---

## Troubleshooting

### Widget Not Loading

1. Check browser console for errors
2. Verify `apiUrl` is correct and accessible
3. Check CORS settings in `.env`
4. Ensure LibreChat backend is running

### Messages Not Sending

1. Verify assistant exists and is public (or user is authenticated)
2. Check network tab for API errors
3. Review LibreChat server logs

### Styling Issues

1. Check CSS variable overrides
2. Verify no conflicting CSS on host page
3. Check z-index if hidden behind other elements

### Context Not Working

1. Verify `setContext()` called after `init()`
2. Check assistant's system prompt includes context handling
3. Review MCP tool configuration

---

## Next Steps

1. Choose your integration platform: **[PrestaShop](COPILOT-PRESTASHOP.md)** or **[TYPO3](COPILOT-TYPO3.md)**
2. Configure LibreChat for copilot mode
3. Create or select a public assistant to use
4. Deploy and test
5. Monitor usage and collect feedback

---

## Differences from Full Mode

| Feature | Full Mode | Copilot Mode |
|---------|-----------|--------------|
| Navigation Sidebar | ✅ Full sidebar | ❌ Hidden |
| Multi-Conversation | ✅ Yes | ❌ Single focus |
| Chat Interface | ✅ Full chat page | ✅ Embedded widget |
| Agent Selection | ✅ User selectable | ❌ Pre-configured |
| Responsive | ✅ Desktop/mobile | ✅ Mobile-first |
| Embedded | ❌ Standalone | ✅ Native embedding |
| Authentication | ✅ Optional | ⚙️ Configurable |

---

## API Reference

See **[COPILOT-API.md](COPILOT-API.md)** for complete JavaScript API documentation.

---

**Last Updated**: 2025-11-07
**Version**: 1.0
