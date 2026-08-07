// sw.js — Network-First Strategy com cache versionado automático
// Versão é derivada do timestamp de build — muda a cada deploy
const BUILD_ID = '__BUILD_ID__'; // Substituído em runtime pelo next.config
const CACHE_VERSION = `phone-center-v${Date.now().toString(36)}`;

// ──────────────────────────────────────────────
// INSTALL: pré-cache mínimo (só assets estáticos essenciais)
// ──────────────────────────────────────────────
self.addEventListener('install', (event) => {
  // Ativa imediatamente sem esperar aba fechar
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) =>
      cache.addAll(['/manifest.json'])
    ).catch(() => {})
  );
});

// ──────────────────────────────────────────────
// ACTIVATE: limpa todos os caches antigos
// ──────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((name) => name.startsWith('phone-center-') && name !== CACHE_VERSION)
          .map((name) => caches.delete(name))
      )
    ).then(() => self.clients.claim())
  );
});

// ──────────────────────────────────────────────
// FETCH: Network-First para tudo
// ──────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Ignora requisições não-GET e chamadas de API / Supabase
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // Nunca cacheia: API routes, Supabase, autenticação
  const noCachePatterns = [
    '/api/',
    'supabase.co',
    'supabase.io',
    '_next/data',
    '__nextjs',
  ];
  if (noCachePatterns.some((p) => url.href.includes(p))) return;

  // Arquivos estáticos do Next.js (_next/static) → Cache-First com revalidação
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.open(CACHE_VERSION).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const fresh = await fetch(request);
        if (fresh.ok) cache.put(request, fresh.clone());
        return fresh;
      })
    );
    return;
  }

  // Tudo mais (HTML, páginas, assets) → Network-First
  // Busca na rede primeiro; só usa cache se offline
  event.respondWith(
    fetch(request, { cache: 'no-store' })
      .then((response) => {
        // Só cacheia respostas válidas
        if (response.ok && response.type !== 'opaque') {
          caches.open(CACHE_VERSION).then((cache) => {
            cache.put(request, response.clone());
          });
        }
        return response;
      })
      .catch(async () => {
        // Offline fallback: tenta o cache
        const cached = await caches.match(request);
        return cached || new Response('Sem conexão com a internet.', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      })
  );
});

// ──────────────────────────────────────────────
// MESSAGE: força atualização quando solicitado pelo app
// ──────────────────────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data === 'CLEAR_CACHE') {
    caches.keys().then((names) => names.forEach((name) => caches.delete(name)));
  }
});
