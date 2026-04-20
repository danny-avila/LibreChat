import { useEffect, useRef } from 'react';
import { useAuthContext } from './AuthContext';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export default function useWebPush() {
  const isInitialized = useRef(false);
  const { user, token } = useAuthContext();

  useEffect(() => {
    // Only attempt if user is logged in
    if (!user || !token || isInitialized.current) return;

    // Check support
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      console.warn('Push messaging is not supported');
      return;
    }

    async function setupPush() {
      try {
        isInitialized.current = true;

        await navigator.serviceWorker.register('/sw.js');
        const registration = await navigator.serviceWorker.ready;

        // Ask for permission if not decided
        if (Notification.permission === 'default') {
          const permission = await Notification.requestPermission();
          if (permission !== 'granted') return;
        } else if (Notification.permission === 'denied') {
          return;
        }

        // Fetch the VAPID key
        const keyRes = await fetch('/api/push/key', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!keyRes.ok) return;
        const { key } = await keyRes.json();
        const applicationServerKey = urlBase64ToUint8Array(key);

        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey
        });

        console.log('[PUSH-DEBUG] Current Subscription Endpoint (last 15 chars):', subscription.endpoint.slice(-15));
        console.log('[PUSH-DEBUG] Full Subscription object:', JSON.stringify(subscription));

        // Send to backend 
        await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(subscription)
        });

        console.log('Web push subscribed successfully');

        // Fetch server-side debug info to verify configuration
        try {
          const debugRes = await fetch('/api/push/debug');
          const lastPushRes = await fetch('/api/webhooks/debug-last');
          if (debugRes.ok && lastPushRes.ok) {
            const debugInfo = await debugRes.json();
            const lastPushInfo = await lastPushRes.json();
            console.log('[SERVER-DEBUG] VAPID Config:', debugInfo);
            console.log('[SERVER-DEBUG] Last Push Result:', lastPushInfo);
          }
        } catch (e) {
          console.warn('[SERVER-DEBUG] Failed to fetch server debug info', e);
        }
      } catch (err) {
        console.error('Failed to setup push notifications:', err);
      }
    }

    setupPush();

    // Listen for navigation messages from the service worker.
    // This is a fallback for when SW's navigate() fails (e.g. first notification
    // before the SW fully controls the page).
    // added comment
    function handleSWMessage(event: MessageEvent) {
      if (event.data && event.data.type === 'NOTIFICATION_CLICK_NAVIGATE') {
        console.log('[PUSH-DEBUG] Received postMessage navigation to:', event.data.url);
        window.location.href = event.data.url;
      }
    }

    navigator.serviceWorker.addEventListener('message', handleSWMessage);

    return () => {
      navigator.serviceWorker.removeEventListener('message', handleSWMessage);
    };
  }, [user, token]);
}
