/**
 * Service worker do LippzAutoApply.
 *
 * REGRA DE PRIVACIDADE (§33): somente o app shell (HTML/CSS/JS/ícones) entra em
 * cache. Nada de /api, nada de Supabase, nada de dados pessoais — um cache do
 * navegador é armazenamento persistente e não é lugar para currículo nem para
 * resposta de IA.
 */
const VERSION = 'jobpilot-v2';
const SHELL_CACHE = `${VERSION}-shell`;
const SHELL_URLS = [
  '/',
  '/index.html',
  '/theme-init.js',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((name) => !name.startsWith(VERSION)).map((name) => caches.delete(name))))
      .then(() => self.clients.claim()),
  );
});

function isCacheableAsset(url) {
  if (url.origin !== self.location.origin) return false;
  if (url.pathname.startsWith('/api/')) return false;
  return (
    url.pathname.startsWith('/assets/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/manifest.webmanifest'
  );
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Nunca interceptar API nem chamadas externas (Supabase incluído).
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  // Navegação: rede primeiro, com o shell como reserva offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
        const cached = await caches.match('/index.html');
        return cached ?? new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
      }),
    );
    return;
  }

  // Assets versionados: cache primeiro (o nome do arquivo muda a cada build).
  if (isCacheableAsset(url)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok && response.type === 'basic') {
            const copy = response.clone();
            void caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        });
      }),
    );
  }
});
