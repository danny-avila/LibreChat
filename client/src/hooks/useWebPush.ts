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
  const { user } = useAuthContext();

  useEffect(() => {
    // Only attempt if user is logged in
    if (!user || isInitialized.current) return;

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
        const keyRes = await fetch('/api/push/key');
        if (!keyRes.ok) return;
        const { key } = await keyRes.json();
        const applicationServerKey = urlBase64ToUint8Array(key);

        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey
        });

        // Send to backend using relative path so cookies (session) are included automatically
        await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(subscription)
        });

        console.log('Web push subscribed successfully');
      } catch (err) {
        console.error('Failed to setup push notifications:', err);
      }
    }

    setupPush();
  }, [user]);
}
