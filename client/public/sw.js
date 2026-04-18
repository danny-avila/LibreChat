self.addEventListener('push', function (event) {
  console.log('🔥 PUSH EVENT RECEIVED', event);
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { body: event.data.text() };
    }
  }

  const title = data.title || 'Notification';
  const options = {
    body: data.body || 'You have a new update.',
    icon: data.icon || '/assets/favicon.ico',
    data: { url: data.url || '/' },
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
