// OtakuVerse — Service Worker v2
//
// Camadas:
//   1. Cross-origin                     → passa direto (não mexemos)
//   2. /__otv/* (manifestos de download)→ cache-only (servem offline)
//   3. /api/img  (páginas de mangá)     → cache-first no cache de DOWNLOADS
//   4. /api/{manga,anime,anilist}/*.json→ network-first com espelho em
//                                         otv-api-v1 (FIFO, trim 80) para
//                                         abrir catálogo visitado offline
//   5. demais /api/*                    → passa direto
//   6. estáticos (icons, manifest, sw)  → cache-first no cache do app
//   7. navegação                        → network-first com fallback pro shell
//
// Os caches otv-downloads-v1 e otv-api-v1 sobrevivem a updates do SW
// (só o cache de estáticos é limpo por versão).

const CACHE = "otv-v3";
const DL_CACHE = "otv-downloads-v2";
const API_CACHE = "otv-api-v2";
const API_CACHE_LIMIT = 80;

const API_JSON = /^\/api\/(manga|anime|anilist)\//;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) =>
        cache.addAll(["/", "/manifest.json", "/icons/icon-192.png", "/icons/icon-512.png"]),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k !== CACHE && k !== DL_CACHE && k !== API_CACHE)
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

/** FIFO trim do espelho de APIs. */
async function trimApiCache() {
  const cache = await caches.open(API_CACHE);
  const keys = await cache.keys();
  if (keys.length > API_CACHE_LIMIT) {
    await Promise.all(
      keys.slice(0, keys.length - API_CACHE_LIMIT).map((k) => cache.delete(k)),
    );
  }
}

async function apiMirror(url) {
  const cache = await caches.open(API_CACHE);
  const cached = await cache.match(url, { ignoreSearch: false });
  // Network-first: tenta a rede, cai pro espelho em caso de falha
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (res.ok) {
      await cache.put(url, res.clone());
      trimApiCache(); // fire-and-forget
    }
    return res;
  } catch (err) {
    if (cached) return cached;
    throw err;
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // 1. Cross-origin: deixa o navegador resolver
  if (url.origin !== self.location.origin) return;

  // 2. Manifestos de download: cache-only
  if (url.pathname.startsWith("/__otv/")) {
    event.respondWith(
      (async () => {
        const hit = await caches.open(DL_CACHE).then((c) => c.match(req));
        return hit ?? new Response("Not found", { status: 404 });
      })(),
    );
    return;
  }

  // 3. Imagens via proxy: busca prioritariamente na rede (sem prender imagens erradas em cache)
  if (url.pathname === "/api/img") {
    event.respondWith(
      (async () => {
        try {
          return await fetch(req);
        } catch {
          const cache = await caches.open(DL_CACHE);
          const hit = await cache.match(req);
          if (hit) return hit;
          return new Response(null, { status: 504 });
        }
      })(),
    );
    return;
  }

  // 4. APIs de catálogo: network-first com espelho
  if (API_JSON.test(url.pathname)) {
    event.respondWith(
      apiMirror(req).catch(
        () => new Response(JSON.stringify({ error: "Offline" }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    return;
  }

  // 5. Outras /api/*: direto
  if (url.pathname.startsWith("/api/")) return;

  // 6. Estáticos com hash/ícones/manifest: cache-first
  if (
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/manifest.json" ||
    url.pathname.startsWith("/_next/static/")
  ) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) await cache.put(req, res.clone());
        return res;
      })(),
    );
    return;
  }

  // 7. Navegação: network-first com fallback pro shell
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          return await fetch(req);
        } catch {
          const cache = await caches.open(CACHE);
          return (await cache.match("/")) ?? Response.error();
        }
      })(),
    );
  }
});
