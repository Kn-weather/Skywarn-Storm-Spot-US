/* Skywarn Storm Spotters - Service Worker
   Caches static assets for offline use. API calls (NWS alerts, radar,
   SPC outlooks) are always fetched from the network since weather data
   is real-time and shouldn't be served stale.

   Cache strategy:
   - Main HTML page: NETWORK-FIRST (always fetch latest from server, fall
     back to cache if offline). This ensures code updates are received
     immediately instead of serving stale cached HTML.
   - Other static assets (CSS, JS, fonts, images): cache-first
   - API calls (api.weather.gov, api.rainviewer.com, spc.noaa.gov):
     network-first (fall back to cache if offline)
   - Map tiles (cartocdn.com, tilecache.rainviewer.com): network-only
     (too many to cache, and they update frequently) */

var CACHE_NAME='skywarn-us-v12';
var STATIC_ASSETS=[
  './manifest.json',
  './skywarn-logo.png',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js'
  /* NOTE: index.html is NOT in this list - it's fetched network-first
     so the latest version is always loaded. See the fetch handler below. */
];

/* Install: pre-cache the core static assets so the app shell loads
   instantly even on first visit. */
self.addEventListener('install',function(event){
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache){
      console.log('[SW] Caching static assets');
      return cache.addAll(STATIC_ASSETS).catch(function(e){
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
  /* TwisterData — third-party iframe, let it handle its own caching */
  if(url.hostname.indexOf('twisterdata.com')>=0)return;
  /* mPING — third-party iframe (display page + assets), let it handle its own caching */
  if(url.hostname.indexOf('mping.ou.edu')>=0)return;

  /* MAIN HTML PAGE: network-first (always fetch latest version).
     This is critical - without this, the SW serves the old cached
     index.html and code updates never reach the user. */
  var isMainPage=url.pathname==='/'||
                 url.pathname==='/Skywarn-Storm-Spot-US/'||
                 url.pathname==='/Skywarn-Storm-Spot-US/index.html'||
                 url.pathname.indexOf('index.html')>=0||
                 (url.pathname.endsWith('/')&&url.hostname.indexOf('github.io')>=0);
  if(isMainPage){
    event.respondWith(
      fetch(event.request).then(function(response){
        /* Got the latest version from network - cache it and return */
        var responseToCache=response.clone();
        caches.open(CACHE_NAME).then(function(cache){
          cache.put(event.request,responseToCache);
        });
        return response;
      }).catch(function(){
        /* Offline - serve cached version as fallback */
        return caches.match(event.request).then(function(cached){
          return cached||new Response('<h1>Offline</h1><p>Connect to the internet to use Skywarn Storm Spotters.</p>',{headers:{'Content-Type':'text/html'}});
        });
      })
    );
    return;
  }

  /* API calls: network-first (real-time weather data) */
  if(url.hostname.indexOf('api.weather.gov')>=0||
     url.hostname.indexOf('api.rainviewer.com')>=0||
     url.hostname.indexOf('www.spc.noaa.gov')>=0||
     url.hostname.indexOf('www.weather.gov')>=0){
    event.respondWith(
      fetch(event.request).then(function(response){
        return response;
      }).catch(function(){
        return caches.match(event.request);
      })
    );
    return;
  }

  /* Other static assets: cache-first */
  event.respondWith(
    caches.match(event.request).then(function(cachedResponse){
      if(cachedResponse){
        return cachedResponse;
      }
      return fetch(event.request).then(function(response){
        if(!response||response.status!==200||response.type!=='basic'&&response.type!=='cors'){
          return response;
        }
        var responseToCache=response.clone();
        caches.open(CACHE_NAME).then(function(cache){
          cache.put(event.request,responseToCache);
        });
        return response;
      }).catch(function(){
        return new Response('',{status:503,statusText:'Offline'});
      });
    })
  );
});
