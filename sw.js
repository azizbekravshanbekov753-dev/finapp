/* ════════════════════════════════════════════
   SERVICE WORKER — FinApp offline rejimi
   ════════════════════════════════════════════ */
const CACHE_NAME = 'finapp-v1';
const ASSETS = [
  './',
  './finance_auth.html',
  './finance_dashboard.html',
  './finance_expenses.html',
  './finance_debts.html',
  './finance_notifications.html',
  './finance_budget.html',
  './finance_analytics.html',
  './finance_recurring.html',
  './finance_split.html',
  './finance_settings.html',
  './finance_onboarding.html',
  './finance_pin.html',
  './finance.css',
  './app.js',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap',
];

/* Install — barcha fayllarni keshga olish */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS.filter(url => !url.startsWith('https://fonts')));
    }).catch(err => console.warn('SW install:', err))
  );
  self.skipWaiting();
});

/* Activate — eski keshlarni tozalash */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

/* Fetch — avval keshdan, bo'lmasa tarmoqdan */
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  if (event.request.url.includes('exchangerate-api.com')) return; // kurs API ni keshlama

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (!response || response.status !== 200 || response.type === 'opaque') return response;
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      }).catch(() => {
        // Offline va keshda yo'q
        if (event.request.destination === 'document') {
          return caches.match('./finance_dashboard.html');
        }
      });
    })
  );
});

/* Push bildirishnoma qabul qilish */
self.addEventListener('push', event => {
  const data = event.data?.json() || { title: 'FinApp', body: 'Yangi eslatma' };
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">💰</text></svg>',
      badge: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">💰</text></svg>',
      vibrate: [200, 100, 200],
      tag: 'finapp',
    })
  );
});

/* Bildirishnomaga bosganda ilovani ochish */
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(clientList => {
      if (clientList.length > 0) return clientList[0].focus();
      return clients.openWindow('./finance_dashboard.html');
    })
  );
});
