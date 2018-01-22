'use strict'

/* eslint-env serviceworker */
/* globals fetch: false */
const CACHE = 'porter'
const cacheExcept = []

self.addEventListener('message', function(e) {
  const message = e.data
  if (message.type == 'loaderConfig') {
    const names = [message.data.name, ...message.data.cacheExcept]
    for (const name of names) {
      if (!cacheExcept.includes(name)) cacheExcept.push(name)
    }
    self.skipWaiting()
  }
})

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.map(function(key) {
        if (key != CACHE) return caches.delete(key)
      })
    ))
  )
})

self.addEventListener('fetch', function(e) {
  if (e.request.method === 'GET' && shouldCache(e.request)) {
    e.respondWith(cacheOrFetch(e))
  }
})

function shouldCache(request) {
  const path = request.url.split('/').slice(3).join('/')
  if (!/\.(css|js)$/.test(path)) return false
  const m = path.match(/^((?:@[-\w]+\/)?[-\.\w]+)\/\d+\./)
  if (!m) return false
  return !cacheExcept.includes(m[1])
}

async function cacheOrFetch(e) {
  const request = e.request
  const cache = await caches.open(CACHE)
  let response = await cache.match(request)

  if (response) {
    // e.waitUntil(cache.add(request))
  } else {
    response = await fetch(request)
    e.waitUntil(cache.put(request, response.clone()))
  }

  return response
}
