// Service Worker for News Intelligence Agent PWA
// Strategy: Cache-first for shell assets, Network-first for API

const CACHE_VERSION = "v2";
const SHELL_CACHE = `news-brief-shell-${CACHE_VERSION}`;
const DATA_CACHE  = `news-brief-data-${CACHE_VERSION}`;

const SHELL_ASSETS = [
  "/",
  "/index.html",
  "/styles.css",
  "/app.js",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

// ── Install: cache shell assets ──────────────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => {
      console.log("[SW] Caching shell assets");
      return cache.addAll(SHELL_ASSETS);
    })
  );
  self.skipWaiting();
});

// ── Activate: clean old caches ───────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== SHELL_CACHE && k !== DATA_CACHE)
          .map((k) => {
            console.log("[SW] Deleting old cache:", k);
            return caches.delete(k);
          })
      )
    )
  );
  self.clients.claim();
});

// ── Fetch: routing strategy ──────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // API calls: Network-first, fall back to cached response
  if (url.pathname.startsWith("/.netlify/functions/") || url.pathname.startsWith("/api/")) {
    event.respondWith(networkFirstStrategy(request));
    return;
  }

  // Shell assets: Cache-first
  event.respondWith(cacheFirstStrategy(request));
});

async function networkFirstStrategy(request) {
  const cache = await caches.open(DATA_CACHE);
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch {
    const cached = await cache.match(request);
    if (cached) {
      console.log("[SW] Serving cached API response for:", request.url);
      return cached;
    }
    return new Response(
      JSON.stringify({ error: "offline", message: "No cached data available" }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }
}

async function cacheFirstStrategy(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const networkResponse = await fetch(request);
    const cache = await caches.open(SHELL_CACHE);
    cache.put(request, networkResponse.clone());
    return networkResponse;
  } catch {
    // Return offline fallback for navigation requests
    if (request.mode === "navigate") {
      const cached = await caches.match("/index.html");
      if (cached) return cached;
    }
    return new Response("Offline", { status: 503 });
  }
}

// ── Push Event: show notification ───────────────────────────────────────────
self.addEventListener("push", (event) => {
  if (!event.data) return;

  try {
    const data = event.data.json();
    const options = {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: "news-brief-notification", // single notification replacing older ones
      data: data.data || {},
    };

    event.waitUntil(
      self.registration.showNotification(data.title || "NewsBrief Update", options)
    );
  } catch (err) {
    console.error("[SW] Error showing push notification:", err);
  }
});

// ── Notification Click: open / focus application window ──────────────────────
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const urlToOpen = new URL(event.notification.data?.url || "/?tab=today", self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      // Check if there is already a window open with this app
      for (const client of windowClients) {
        if (client.url === urlToOpen || client.url.startsWith(self.location.origin)) {
          if ("focus" in client) {
            // If tab query changes, navigate to the target url
            if (client.url !== urlToOpen) {
              return client.navigate(urlToOpen).then((c) => c.focus());
            }
            return client.focus();
          }
        }
      }
      // If no window is open, open a new one
      if (self.clients.openWindow) {
        return self.clients.openWindow(urlToOpen);
      }
    })
  );
});

