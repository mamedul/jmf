const CACHE_NAME = "jmf-v1-0-0"
const STATIC_CACHE_URLS = [
  "./",
  "./index.html",
  "./app.css",
  "./app.js",
  "./manifest.json",
  "./favicon.ico",
  "./favicon-16x16.png",
  "./favicon-32x32.png",
  "./favicon-32x32.png",
  "./apple-touch-icon.png",
  "./android-chrome-192x192.png",
  "./android-chrome-512x512.png",
  "./search.png",
  "./plus.png"
]


self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("Opened cache")
      // Cache resources individually to avoid failures
      return Promise.allSettled(
        STATIC_CACHE_URLS.map((url) =>
          cache.add(url).catch((err) => {
            console.warn(`Failed to cache ${url}:`, err)
            return null
          }),
        ),
      )
    }),
  )
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  //clients.claim();
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log("Deleting old cache:", cacheName)
            return caches.delete(cacheName)
          }
        }),
      )
    }),
  )
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});

// Background sync for offline test results
self.addEventListener("sync", (event) => {
  if (event.tag === "background-sync") {
    event.waitUntil(doBackgroundSync())
  }
});

async function doBackgroundSync() {
  // Handle any pending operations when back online
  console.log("Background sync triggered")
}

// Push notifications
self.addEventListener("push", (event) => {
  const options = {
    body: event.data ? event.data.text() : "JMF",
    icon: "./android-chrome-192x192.png",
    badge: "./apple-touch-icon.png",
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1,
    },
    actions: [
      {
        action: "view",
        title: "View Results",
        icon: "./android-chrome-192x192.png",
      },
      {
        action: "close",
        title: "Close",
        icon: "./android-chrome-192x192.png",
      },
    ],
  }
  event.waitUntil(self.registration.showNotification("JMF", options))
});

// Notification click handling
self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  if (event.action === "view") {
    event.waitUntil(clients.openWindow("./"))
  }
});

// --- VERSION CHECK LOGIC ---
self.addEventListener('message', async (event) => {
  if (event.data && event.data.type === 'CHECK_VERSION') {
    try {
      // 1. Fetch the manifest from the network (bypass cache)
      const networkManifestRes = await fetch('./manifest.json?t=' + Date.now(), { 
        cache: 'no-store' 
      });
      const networkManifest = await networkManifestRes.json();

      // 2. Fetch the manifest currently stored in Cache API (if exists)
      const cache = await caches.open(CACHE_NAME);
      const cachedManifestRes = await cache.match('./manifest.json');
      
      let cachedVersion = '0.0.0';
      if (cachedManifestRes) {
        const cachedManifest = await cachedManifestRes.json();
        cachedVersion = cachedManifest.version;
      }

      console.log(`Current: ${cachedVersion} | New: ${networkManifest.version}`);

      // 3. Compare versions
      if (networkManifest.version !== cachedVersion) {
        
        // 4. Update the cached manifest immediately so we don't notify again until next version
        await cache.put('./manifest.json', new Response(JSON.stringify(networkManifest)));

        // 5. Notify the React Client
        const allClients = await self.clients.matchAll({ includeUncontrolled: true });
        allClients.forEach(client => {
          client.postMessage({
            type: 'UPDATE_AVAILABLE',
            version: networkManifest.version
          });
        });
      }
    } catch (error) {
      console.error('Version check failed:', error);
    }
  }

  // Allow the client to force the SW to take control immediately
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});