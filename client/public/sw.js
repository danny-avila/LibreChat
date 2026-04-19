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
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      const url = event.notification.data.url;
      for (const client of clientList) {
        if (client.url === url && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    }),
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
