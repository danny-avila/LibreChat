// =====================================================
// LIFECYCLE: Ensure this SW activates IMMEDIATELY
// Without these, an old/stale SW handles the first push
// and the new SW sits in "waiting" state doing nothing.
// =====================================================

self.addEventListener('install', function (event) {
  console.log('[SW] Installing — calling skipWaiting()');
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  console.log('[SW] Activating — calling clients.claim()');
  event.waitUntil(self.clients.claim());
});

// =====================================================
// PUSH: Handle incoming push notifications
// =====================================================

self.addEventListener('push', function (event) {
  console.log('🔥 PUSH RECEIVED');
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
      console.log('[PUSH-DEBUG] Received JSON Payload:', data);
    } catch (e) {
      console.warn('[PUSH-DEBUG] Data is not JSON:', event.data.text());
      data = { body: event.data.text() };
    }
  } else {
    console.warn('[PUSH-DEBUG] Event has no data');
  }

  const title = data.title || 'Ajrasakha Update';
  const options = {
    body: data.body || 'Your answer is ready!',
    icon: data.icon || '/assets/annam-logo.png',
    data: { url: data.url || '/' },
    vibrate: [100, 50, 100],
    badge: '/assets/favicon-32x32.png'
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// =====================================================
// NOTIFICATION CLICK: Navigate to the target URL
// =====================================================

self.addEventListener('notificationclick', function (event) {
  event.notification.close();

  const urlToOpen = event.notification.data && event.notification.data.url
    ? event.notification.data.url
    : '/';
  console.log('[PUSH-DEBUG] Clicked notification, target URL:', urlToOpen);

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (windowClients) {
      // 1. Try to find a window already at the exact URL
      for (let i = 0; i < windowClients.length; i++) {
        var client = windowClients[i];
        if (client.url === urlToOpen && 'focus' in client) {
          console.log('[PUSH-DEBUG] Found exact tab match, focusing');
          return client.focus();
        }
      }

      // 2. Try to navigate an existing window
      if (windowClients.length > 0) {
        console.log('[PUSH-DEBUG] Focusing existing tab and navigating');
        var targetClient = windowClients[0];
        return targetClient.focus().then(function (focusedClient) {
          // navigate() only works if the SW controls the client.
          // If it doesn't (e.g. first load before clients.claim propagates),
          // fall back to postMessage so the app can navigate itself.
          if (focusedClient && 'navigate' in focusedClient) {
            return focusedClient.navigate(urlToOpen).catch(function (err) {
              console.warn('[PUSH-DEBUG] navigate() failed, using postMessage fallback:', err);
              focusedClient.postMessage({
                type: 'NOTIFICATION_CLICK_NAVIGATE',
                url: urlToOpen
              });
            });
          } else if (focusedClient) {
            focusedClient.postMessage({
              type: 'NOTIFICATION_CLICK_NAVIGATE',
              url: urlToOpen
            });
          }
        });
      }

      // 3. No window open — open a new one
      console.log('[PUSH-DEBUG] No existing tabs found, opening new window');
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen).catch(function (err) {
          console.error('[PUSH-DEBUG] Failed to open new window:', err);
        });
      }
    })
  );
});

// =====================================================
// SUBSCRIPTION CHANGE: Auto-renew if browser rotates keys
// =====================================================

self.addEventListener('pushsubscriptionchange', function (event) {
  event.waitUntil(
    self.registration.pushManager.subscribe(event.oldSubscription.options)
      .then(function (newSubscription) {
        console.log('Push subscription renewed automatically:', newSubscription);
        return fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newSubscription)
        });
      }).catch(function (e) {
        console.error('Failed to auto-renew push subscription', e);
      })
  );
});
