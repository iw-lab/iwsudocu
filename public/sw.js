const CACHE_VERSION = "v11";
const STATIC_CACHE = `kanchaeum-static-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `kanchaeum-dynamic-${CACHE_VERSION}`;
const IMMUTABLE_CACHE = `kanchaeum-immutable-${CACHE_VERSION}`;

// App shell routes to precache
const APP_SHELL = [
  "/",
  "/play",
  "/daily",
  "/profile",
  "/shop",
  "/leaderboard",
  "/achievements",
  "/settings",
  "/privacy",
  "/licenses",
  "/print",
  "/manifest.json",
  "/icon.svg",
];

const ALL_CACHES = [STATIC_CACHE, DYNAMIC_CACHE, IMMUTABLE_CACHE];

// Offline fallback HTML
const OFFLINE_HTML = `<!DOCTYPE html><html lang="ko"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>칸채움 - 오프라인</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:system-ui,sans-serif;background:#0F172A;color:#fff;
display:flex;flex-direction:column;align-items:center;justify-content:center;
height:100vh;height:100dvh;text-align:center;padding:24px}
h1{font-size:28px;margin-bottom:8px;background:linear-gradient(135deg,#818cf8,#c084fc,#f472b6);
-webkit-background-clip:text;-webkit-text-fill-color:transparent}
p{color:#94a3b8;margin-bottom:32px;font-size:15px;line-height:1.5}
button{background:#4F46E5;color:white;border:none;padding:14px 36px;
border-radius:12px;font-size:16px;font-weight:600;cursor:pointer;
transition:transform .15s,background .15s}
button:active{transform:scale(.95);background:#4338CA}
.icon{font-size:48px;margin-bottom:16px}
</style></head><body>
<div class="icon">📡</div>
<h1>칸채움</h1>
<p>인터넷에 연결할 수 없습니다.<br>연결 후 다시 시도해주세요.</p>
<button onclick="location.reload()">다시 시도</button>
</body></html>`;

// Install: precache app shell
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) =>
      cache.addAll(APP_SHELL).catch(() => {
        // Cache what we can, fail silently for individual items
        return Promise.allSettled(
          APP_SHELL.map((url) =>
            cache.add(url).catch(() => console.log("SW: failed to cache", url)),
          ),
        );
      }),
    ),
  );
  self.skipWaiting();
});

// Activate: clean old caches and notify clients
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => !ALL_CACHES.includes(key))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => {
        // Notify all clients about the update
        self.clients.matchAll().then((clients) => {
          clients.forEach((client) => {
            client.postMessage({ type: "SW_UPDATED", version: CACHE_VERSION });
          });
        });
      }),
  );
  self.clients.claim();
});

// Helper: is this a navigation request (HTML page)?
function isNavigationRequest(request) {
  return (
    request.mode === "navigate" ||
    (request.method === "GET" &&
      request.headers.get("accept")?.includes("text/html"))
  );
}

// Helper: is this an immutable asset (_next/static)?
function isImmutableAsset(url) {
  return url.pathname.includes("/_next/static/");
}

// Helper: is this a static asset?
function isStaticAsset(url) {
  return /\.(js|css|woff2?|ttf|otf|png|jpg|jpeg|gif|svg|ico|webp|avif|mp3|ogg|wav)(\?.*)?$/.test(
    url.pathname,
  );
}

// Helper: is this an API call?
function isApiRequest(url) {
  return url.pathname.startsWith("/api/");
}

// Helper: is this a Next.js RSC/internal request?
function isRscRequest(url) {
  return url.searchParams.has("_rsc") || url.pathname.includes("__next.");
}

// Helper: safe cache put (guards against non-GET and other errors)
function safeCachePut(cacheName, request, response) {
  if (request.method !== "GET") return;
  caches
    .open(cacheName)
    .then((cache) => cache.put(request, response).catch(() => {}));
}

// Fetch handler
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin and GET requests
  if (request.method !== "GET") return;
  if (
    url.origin !== self.location.origin &&
    !url.hostname.includes("numero-quest")
  )
    return;

  // Skip RSC prefetch requests (they 404 on static export)
  if (isRscRequest(url)) return;

  // 1. Immutable assets (_next/static/) - Cache first, never expires
  if (isImmutableAsset(url)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request)
          .then((response) => {
            if (response.ok) {
              safeCachePut(IMMUTABLE_CACHE, request, response.clone());
            }
            return response;
          })
          .catch(() => caches.match(request));
      }),
    );
    return;
  }

  // 2. API requests - Network first, cache fallback
  if (isApiRequest(url)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            safeCachePut(DYNAMIC_CACHE, request, response.clone());
          }
          return response;
        })
        .catch(() => caches.match(request)),
    );
    return;
  }

  // 3. Navigation requests (HTML pages) - Network first, cache fallback, offline fallback
  if (isNavigationRequest(request)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            safeCachePut(STATIC_CACHE, request, response.clone());
          }
          return response;
        })
        .catch(() =>
          caches.match(request).then((cached) => {
            if (cached) return cached;
            // Return offline fallback
            return new Response(OFFLINE_HTML, {
              headers: { "Content-Type": "text/html; charset=UTF-8" },
            });
          }),
        ),
    );
    return;
  }

  // 4. Static assets (JS, CSS, images, fonts, audio) - Stale while revalidate
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const fetchPromise = fetch(request)
          .then((response) => {
            if (response.ok) {
              safeCachePut(DYNAMIC_CACHE, request, response.clone());
            }
            return response;
          })
          .catch(() => cached);

        return cached || fetchPromise;
      }),
    );
    return;
  }

  // 5. Everything else - Network first
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          safeCachePut(DYNAMIC_CACHE, request, response.clone());
        }
        return response;
      })
      .catch(() => caches.match(request)),
  );
});
