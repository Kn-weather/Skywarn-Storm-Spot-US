/* Skywarn Storm Spotters - Service Worker
   Caches static assets for offline use. API calls (NWS alerts, radar,
   SPC outlooks) are always fetched from the network since weather data
   is real-time and shouldn't be served stale.

   Cache strategy:
   - Static assets (HTML, CSS, JS, images, fonts): cache-first
   - API calls (api.weather.gov, api.rainviewer.com, spc.noaa.gov):
     network-first (fall back to cache if offline)
   - Map tiles (cartocdn.com, tilecache.rainviewer.com): network-only
     (too many to cache, and they update frequently) */

var CACHE_NAME='skywarn-us-v2';
var STATIC_ASSETS=[
  './',
  './index.html',
  './manifest.json',
  './skywarn-logo.png',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js'
];

/* Install: pre-cache the core static assets so the app shell loads
   instantly even on first visit. */
self.addEventListener('install',function(event){
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache){
      console.log('[SW] Caching static assets');
      return cache.addAll(STATIC_ASSETS).catch(function(e){
        /* Don't fail the whole install if one CDN resource can't be cached */
        console.warn('[SW] Some assets failed to cache:',e);
      });
    })
  );
  self.skipWaiting();
});

/* Activate: clean up old caches from previous versions */
self.addEventListener('activate',function(event){
  event.waitUntil(
    caches.keys().then(function(cacheNames){
      return Promise.all(
        cacheNames.filter(function(name){
          return name!==CACHE_NAME;
        }).map(function(name){
          console.log('[SW] Deleting old cache:',name);
          return caches.delete(name);
        })
      );
    })
  );
  self.clients.claim();
});

/* Fetch: route requests to cache or network based on the URL */
self.addEventListener('fetch',function(event){
  var url=new URL(event.request.url);

  /* Skip non-GET requests (POST, PUT, etc.) - can't cache them */
  if(event.request.method!=='GET')return;

  /* Skip cross-origin requests that we don't want to cache:
     - Map tiles (CARTO, RainViewer tile cache) - too many, update frequently
     - CORS proxies (allorigins, corsproxy.io) - API data, should be fresh
     - Twitter/X widgets - third-party, let them handle their own caching
     - platform.x.com - Twitter SDK
  */
  if(url.hostname.indexOf('basemaps.cartocdn.com')>=0)return;
  if(url.hostname.indexOf('tilecache.rainviewer.com')>=0)return;
  if(url.hostname.indexOf('api.allorigins.win')>=0)return;
  if(url.hostname.indexOf('corsproxy.io')>=0)return;
  if(url.hostname.indexOf('platform.x.com')>=0)return;
  if(url.hostname.indexOf('cdn.syndication.twimg.com')>=0)return;
  if(url.hostname.indexOf('ton.twimg.com')>=0)return;
  if(url.hostname.indexOf('abs.twimg.com')>=0)return;
  if(url.hostname.indexOf('pbs.twimg.com')>=0)return;

  /* API calls: network-first (real-time weather data) */
  if(url.hostname.indexOf('api.weather.gov')>=0||
     url.hostname.indexOf('api.rainviewer.com')>=0||
     url.hostname.indexOf('www.spc.noaa.gov')>=0||
     url.hostname.indexOf('www.weather.gov')>=0){
    event.respondWith(
      fetch(event.request).then(function(response){
        return response;
      }).catch(function(){
        /* Offline - try cache as fallback */
        return caches.match(event.request);
      })
    );
    return;
  }

  /* Static assets: cache-first */
  event.respondWith(
    caches.match(event.request).then(function(cachedResponse){
      if(cachedResponse){
        /* Serve from cache */
        return cachedResponse;
      }
      /* Not in cache - fetch from network, cache the result */
      return fetch(event.request).then(function(response){
        /* Only cache successful responses */
        if(!response||response.status!==200||response.type!=='basic'&&response.type!=='cors'){
          return response;
        }
        /* Clone the response (can only consume once) */
        var responseToCache=response.clone();
        caches.open(CACHE_NAME).then(function(cache){
          cache.put(event.request,responseToCache);
        });
        return response;
      }).catch(function(){
        /* Offline and not in cache - return nothing */
        return new Response('',{status:503,statusText:'Offline'});
      });
    })
  );
});
