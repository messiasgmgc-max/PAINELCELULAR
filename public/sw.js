// sw.js — Cache estável para chunks imutáveis + Stale-While-Revalidate para assets + Network-First para HTML
const STATIC_CACHE = 'phone-center-static-v3';
const ASSET_CACHE = 'phone-center-assets-v3';
const PAGE_CACHE = 'phone-center-pages-v3';
const ACTIVE_CACHES = new Set([STATIC_CACHE, ASSET_CACHE, PAGE_CACHE]);

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches
      .open(ASSET_CACHE)
      .then((cache) => cache.addAll(['/manifest.json', '/manifest-taxas.webmanifest']))
      .catch(() => {})
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((name) => name.startsWith('phone-center-') && !ACTIVE_CACHES.has(name))
            .map((name) => caches.delete(name))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // Nunca intercepta APIs, Supabase ou dados dinâmicos do Next.js
  if (
    url.pathname.startsWith('/api/') ||
    url.hostname.includes('supabase.co') ||
    url.hostname.includes('supabase.io') ||
    url.pathname.includes('_next/data') ||
    url.pathname.includes('__nextjs')
  ) {
    return;
  }

  // 1) Chunks estáticos do Next.js (têm hash no nome, imutáveis) → Cache-First real
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const fresh = await fetch(request);
        if (fresh.ok) cache.put(request, fresh.clone());
        return fresh;
      })
    );
    return;
  }

  // 2) Imagens, ícones e fontes estáticas do próprio domínio → Stale-While-Revalidate
  const isStaticAsset =
    url.origin === self.location.origin &&
    /\.(?:png|jpg|jpeg|webp|gif|svg|ico|woff2?|ttf|otf)$/i.test(url.pathname);

  if (isStaticAsset) {
    event.respondWith(
      caches.open(ASSET_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        const networkPromise = fetch(request)
          .then((response) => {
            if (response.ok && response.type !== 'opaque') {
              cache.put(request, response.clone());
            }
            return response;
          })
          .catch(() => null);

        if (cached) {
          event.waitUntil(networkPromise);
          return cached;
        }
        const fresh = await networkPromise;
        return fresh || new Response('', { status: 404 });
      })
    );
    return;
  }

  // 3) Páginas HTML / navegação → Network-First (sempre busca o HTML atualizado do servidor; fallback offline)
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request, { cache: 'no-cache' })
        .then((response) => {
          if (response.ok && response.type !== 'opaque') {
            caches.open(PAGE_CACHE).then((cache) => cache.put(request, response.clone()));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          return (
            cached ||
            new Response('Sem conexão com a internet.', {
              status: 503,
              headers: { 'Content-Type': 'text/plain; charset=utf-8' },
            })
          );
        })
    );
  }
});

// Permite limpeza manual de cache quando o usuário clica em "Atualizar Agora"
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data === 'CLEAR_CACHE') {
    caches.keys().then((names) => Promise.all(names.map((n) => caches.delete(n))));
  }
});
