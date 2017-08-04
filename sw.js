const SilM_WorkerVersion = 2;
const SilM_CacheName = `SilverbirdM_Cache_Version${SilM_WorkerVersion}`;

self.addEventListener("install", (event) => {
  //console.info(`sw:install: %o`, event);
  event.waitUntil(Promise.all([
    self.skipWaiting(),
    caches.open(SilM_CacheName).then((cache) => {
      console.info(`sw:install: open cache: ${SilM_CacheName}`);
    })
  ]));
});

self.addEventListener("activate", (event) => {
  //console.info(`sw:activate: %o`, event);
  event.waitUntil(Promise.all([
    self.clients.claim(),
    caches.keys().then((cacheNames) => {
      return Promise.all(cacheNames.map((cacheName) => {
        if(cacheName !== SilM_CacheName) {
          console.info(`sw:activate: delete cache: %s`, cacheName);
          return caches.delete(cacheName);
        }
      }));
    })
  ]));
});

self.addEventListener("fetch", (event) => {
  const url = event.request.url;
  if(url.includes("chrome-extension://")
  || url.includes(".twitter.com")
  || event.request.method !== "GET") {
    return;
  }
  event.respondWith(
    caches.open(SilM_CacheName).then((cache) => {
      return cache.match(event.request).then((response) => {
        if(response) {
          return response;
        } else {
          return fetch(event.request.clone()).then((response) => {
            if(response.ok) {
              cache.put(event.request, response.clone());
            }
            return response;
          });
        }
      });
    }).catch((e) => {
      console.warn(`sw:fetch: respondWith: %o`, e);
    })
  )
  //console.info(`sw:fetch: %o`, event);
});

self.addEventListener("message", (event) => {
  if(!event.data) {
    return;
  }
  switch(true) {
    case event.data.request === "preload" && !!event.data.url:
      doPreload(event.data.url);
      break;
    default:
      console.info(`sw:message: %o`, event);
      break;
  }
});

async function doPreload(url) {
  try {
    const cache = await caches.open(SilM_CacheName);
    await cache.add(new URL(url));
    return `cached: ${url}`;
  } catch(e) {
    return e;
  }
}
