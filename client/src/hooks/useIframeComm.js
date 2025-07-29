import { useEffect, useCallback, useRef } from 'react';
import { 
  sendMessageToParent, 
  isInIframe, 
  sendAuthStatusToParent,
  sendNavigationToParent,
  sendErrorToParent 
} from '../utils/iframeComm';

/**
 * Custom hook for iframe communication
 * @param {object} options - Configuration options
 * @returns {object} Communication utilities
 */
export const useIframeComm = (options = {}) => {
  const {
    onMessage = null,
    onAuthToken = null,
    onThemeChange = null,
    onNavigate = null,
    onUserData = null
  } = options;

  const messageHandlerRef = useRef(null);

  // Send message to parent
  const sendToParent = useCallback((type, payload, targetOrigin) => {
    sendMessageToParent(type, payload, targetOrigin);
  }, []);

  // Send authentication status
  const sendAuthStatus = useCallback((isAuthenticated, user) => {
    sendAuthStatusToParent(isAuthenticated, user);
  }, []);

  // Send navigation change
  const sendNavigation = useCallback((path, title) => {
    sendNavigationToParent(path, title);
  }, []);

  // Send error to parent
  const sendError = useCallback((error, context) => {
    sendErrorToParent(error, context);
  }, []);

  // Check if in iframe
  const inIframe = isInIframe();
  console.log('In iframe:', inIframe);
  
  useEffect(() => {
    if (!inIframe) return;

    const handleMessage = (event) => {
      // Basic origin check (you may want to make this configurable)
      const allowedOrigins = [
        window.location.origin,
        'https://div25.com',
        'https://www.div25.com',
        /^https:\/\/[^.]+\.div25\.com$/
      ];

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

        // Handle specific message types with callbacks
        switch (type) {
          case 'AUTH_TOKEN':
            if (onAuthToken && typeof onAuthToken === 'function') {
              onAuthToken(payload);
            }
            break;

          case 'THEME_CHANGE':
            if (onThemeChange && typeof onThemeChange === 'function') {
              onThemeChange(payload);
            }
            break;

          case 'NAVIGATE':
            if (onNavigate && typeof onNavigate === 'function') {
              onNavigate(payload);
            }
            break;

          case 'USER_DATA':
            if (onUserData && typeof onUserData === 'function') {
              onUserData(payload);
            }
            break;

          default:
            // Pass all messages to general handler if provided
            if (onMessage && typeof onMessage === 'function') {
              onMessage(event);
            }
        }
      } catch (error) {
        console.error('Error handling iframe message:', error);
        sendError(error, 'useIframeComm');
      }
    };

    messageHandlerRef.current = handleMessage;
    window.addEventListener('message', handleMessage);

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [inIframe, onMessage, onAuthToken, onThemeChange, onNavigate, onUserData, sendError]);

  return {
    inIframe,
    sendToParent,
    sendAuthStatus,
    sendNavigation,
    sendError
  };
};

/**
 * Hook for sending authentication updates to parent
 * @param {boolean} isAuthenticated - Current auth status
 * @param {object} user - Current user data
 */
export const useAuthSync = (isAuthenticated, user) => {
  const { sendAuthStatus, inIframe } = useIframeComm();

  useEffect(() => {
    if (inIframe && typeof isAuthenticated === 'boolean') {
      sendAuthStatus(isAuthenticated, user);
    }
  }, [isAuthenticated, user, sendAuthStatus, inIframe]);
};

/**
 * Hook for syncing navigation changes to parent
 * @param {string} currentPath - Current route path
 * @param {string} title - Current page title
 */
export const useNavigationSync = (currentPath, title) => {
  const { sendNavigation, inIframe } = useIframeComm();

  useEffect(() => {
    if (inIframe && currentPath) {
      sendNavigation(currentPath, title);
    }
  }, [currentPath, title, sendNavigation, inIframe]);
};

/**
 * Hook for handling theme synchronization with parent
 * @param {function} setTheme - Theme setter function
 * @returns {function} Function to send theme changes to parent
 */
export const useThemeSync = (setTheme) => {
  const { sendToParent, inIframe } = useIframeComm({
    onThemeChange: ({ theme }) => {
      if (theme && setTheme) {
        setTheme(theme);
      }
    }
  });

  const sendThemeToParent = useCallback((theme) => {
    if (inIframe) {
      sendToParent('THEME_CHANGE', { theme });
    }
  }, [sendToParent, inIframe]);

  return sendThemeToParent;
};
