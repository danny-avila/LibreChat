/**
 * Utility functions for iframe communication between LibreChat and parent windows
 */

/**
 * Send a message to the parent window (if running in iframe)
 * @param {string} type - Message type
 * @param {any} payload - Message payload
 * @param {string} targetOrigin - Target origin (default: '*')
 */
export const sendMessageToParent = (type, payload = {}, targetOrigin = '*') => {
  if (window.parent && window.parent !== window) {
    try {
      window.parent.postMessage({ type, payload }, targetOrigin);
      console.log(`Message sent to parent: ${type}`, payload);
    } catch (error) {
      console.error('Error sending message to parent:', error);
    }
  }
};

/**
 * Check if the application is running inside an iframe
 * @returns {boolean} True if running in iframe
 */
export const isInIframe = () => {
  return window.parent !== window;
};

/**
 * Get the parent window origin (if available)
 * @returns {string|null} Parent origin or null
 */
export const getParentOrigin = () => {
  try {
    if (isInIframe() && document.referrer) {
      const url = new URL(document.referrer);
      return url.origin;
    }
  } catch (error) {
    console.warn('Cannot determine parent origin:', error);
  }
  return null;
};

/**
 * Send iframe height to parent for dynamic resizing
 */
export const sendHeightToParent = () => {
  if (isInIframe()) {
    const height = Math.max(
      document.body.scrollHeight,
      document.body.offsetHeight,
      document.documentElement.clientHeight,
      document.documentElement.scrollHeight,
      document.documentElement.offsetHeight
    );
    
    sendMessageToParent('IFRAME_HEIGHT', { height });
  }
};

/**
 * Send authentication status to parent
 * @param {boolean} isAuthenticated - Authentication status
 * @param {any} user - User data (optional)
 */
export const sendAuthStatusToParent = (isAuthenticated, user = null) => {
  sendMessageToParent('AUTH_STATUS', { isAuthenticated, user });
};

/**
 * Send error information to parent
 * @param {Error|string} error - Error object or message
 * @param {string} context - Error context
 */
export const sendErrorToParent = (error, context = 'general') => {
  const errorData = {
    message: error?.message || error,
    context,
    timestamp: Date.now(),
    stack: error?.stack
  };
  
  sendMessageToParent('ERROR', errorData);
};

/**
 * Send navigation change to parent
 * @param {string} path - Current path
 * @param {string} title - Page title
 */
export const sendNavigationToParent = (path, title = document.title) => {
  sendMessageToParent('NAVIGATION_CHANGE', { path, title });
};

/**
 * Request specific permissions from parent
 * @param {string[]} permissions - Array of permission names
 */
export const requestPermissionsFromParent = (permissions) => {
  sendMessageToParent('REQUEST_PERMISSIONS', { permissions });
};

/**
 * Enhanced message listener that handles common iframe patterns
 * @param {function} customHandler - Custom handler for additional message types
 * @returns {function} Cleanup function
 */
export const setupIframeMessageListener = (customHandler = null) => {
  const handleMessage = (event) => {
    // Default allowed origins for div25.com integration
    const allowedOrigins = [
      window.location.origin,
      'https://div25.com',
      'https://www.div25.com',
      /^https:\/\/[^.]+\.div25\.com$/
    ];

    // Check origin
    const isAllowedOrigin = allowedOrigins.some(origin => {
      if (typeof origin === 'string') {
        return event.origin === origin;
      } else if (origin instanceof RegExp) {
        return origin.test(event.origin);
      }
      return false;
    });

    if (!isAllowedOrigin) {
      console.warn('Message received from unauthorized origin:', event.origin);
      return;
    }

    try {
      const { type, payload } = event.data;

      // Handle common message types
      switch (type) {
        case 'PING':
          // Respond to ping with pong
          event.source?.postMessage({
            type: 'PONG',
            payload: { timestamp: Date.now() }
          }, event.origin);
          break;

        case 'REQUEST_HEIGHT':
          // Send current height
          sendHeightToParent();
          break;

        case 'FOCUS':
          // Focus the iframe content
          window.focus();
          break;

        case 'BLUR':
          // Blur the iframe content
          window.blur();
          break;

        default:
          // Pass to custom handler if provided
          if (customHandler && typeof customHandler === 'function') {
            customHandler(event);
          }
      }
    } catch (error) {
      console.error('Error handling iframe message:', error);
      sendErrorToParent(error, 'message_handling');
    }
  };

  // Add listener
  window.addEventListener('message', handleMessage);

  // Return cleanup function
  return () => window.removeEventListener('message', handleMessage);
};

/**
 * Initialize iframe communication with parent
 * @param {object} options - Configuration options
 */
export const initializeIframeComm = (options = {}) => {
  const {
    sendReadySignal = true,
    enableAutoResize = false,
    customHandler = null,
    readyPayload = {}
  } = options;

  // Set up message listener
  const cleanup = setupIframeMessageListener(customHandler);

  // Send ready signal if requested and in iframe
  if (sendReadySignal && isInIframe()) {
    setTimeout(() => {
      sendMessageToParent('IFRAME_READY', {
        timestamp: Date.now(),
        origin: window.location.origin,
        path: window.location.pathname,
        userAgent: navigator.userAgent,
        ...readyPayload
      });
    }, 100); // Small delay to ensure parent is ready
  }

  // Enable auto-resize if requested
  if (enableAutoResize && isInIframe()) {
    // Send initial height
    setTimeout(sendHeightToParent, 500);

    // Set up resize observer for dynamic height updates
    if (window.ResizeObserver) {
      const resizeObserver = new ResizeObserver(() => {
        sendHeightToParent();
      });
      
      resizeObserver.observe(document.body);

      // Enhanced cleanup
      const originalCleanup = cleanup;
      return () => {
        originalCleanup();
        resizeObserver.disconnect();
      };
    }
  }

  return cleanup;
};
