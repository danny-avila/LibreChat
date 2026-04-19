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
/*self.addEventListener('push', function (event) {
  event.waitUntil(
    self.registration.showNotification('🔥 WORKING', {
      body: 'If you see this, push is fine',
    })
  );
});*/

self.addEventListener('notificationclick', function (event) {
  event.notification.close();

  // Get the target URL from the notification data
  const urlToOpen = event.notification.data.url;
  console.log('[PUSH-DEBUG] Clicked notification, target URL:', urlToOpen);

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // 1. Try to find a window that is already open at the EXACT URL
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url === urlToOpen && 'focus' in client) {
          console.log('[PUSH-DEBUG] Found exact tab match, focusing');
          return client.focus();
        }
      }

      // 2. If no exact match, try to find ANY window of the same app and navigate it
      if (windowClients.length > 0) {
        console.log('[PUSH-DEBUG] No exact match, focusing first app tab');
        const client = windowClients[0];
        if ('focus' in client) {
          return client.focus().then((c) => {
            if (c && 'navigate' in c) {
              return c.navigate(urlToOpen);
            }
          });
        }
      }

      // 3. If no window open at all, open a new one
      console.log('[PUSH-DEBUG] No existing tabs found, opening new window');
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen).catch((err) => {
          console.error('[PUSH-DEBUG] Failed to open new window:', err);
        });
      }
    })
  );
});

self.addEventListener('pushsubscriptionchange', function (event) {
  // Push manager auto-renews locally
  event.waitUntil(
    self.registration.pushManager.subscribe(event.oldSubscription.options)
      .then(function (newSubscription) {
        console.log('Push subscription renewed automatically:', newSubscription);
        // Using fetch to resend it directly to backend if origin is same and uses cookies. 
        // A robust app will also have the UI layer sync it on next load, which useWebPush does.
        return fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newSubscription)
        });
      }).catch((e) => {
         console.error('Failed to auto-renew push subscription', e);
      })
  );
});
