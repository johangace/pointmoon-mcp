#!/usr/bin/env node
// A local demonstration, not a publicly deployable proxy or a hardware product.
import { createServer } from 'node:http'
import { pathToFileURL } from 'node:url'
import { fetchContext, projectWeather, renderDisplay, syntheticPayload } from './context.mjs'

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])

/** Even an exported server accidentally bound to all interfaces refuses remote peers. */
export function isLoopbackSocket(socket) {
  return LOOPBACK.has(socket?.localAddress) && LOOPBACK.has(socket?.remoteAddress)
}

export function createDisplayServer({ demo = false, lat = 42.36, lng = -71.06, baseUrl, apiKey, fetcher, now = Date.now } = {}) {
  let cache = null
  let refreshAt = 0
  let pending = null
  const load = async () => {
    const clock = now()
    if (demo) return syntheticPayload(clock, [8, 18, 27][Math.floor(clock / 60_000) % 3])
    if (clock < refreshAt) return cache
    if (!pending) {
      pending = fetchContext({ lat, lng, baseUrl, apiKey, fetcher })
        .then((payload) => { cache = payload; refreshAt = now() + 60_000; return payload })
        .catch(() => { cache = null; refreshAt = now() + 60_000; return null })
        .finally(() => { pending = null })
    }
    return pending
  }
  return createServer(async (req, res) => {
    // Validate socket addresses as well as Host: headers alone cannot prove locality.
    if (!isLoopbackSocket(res.socket)) { res.writeHead(403); res.end('Local demo only'); return }
    const allowedHosts = new Set(['127.0.0.1', 'localhost', '[::1]'].map((host) => `${host}:${res.socket.localPort}`))
    if (!allowedHosts.has(req.headers.host)) { res.writeHead(403); res.end('Local demo only'); return }
    if (req.method !== 'GET' || req.url !== '/') { res.writeHead(404); res.end('Not found'); return }
    try {
      const context = projectWeather(await load(), now())
      const html = renderDisplay(context, { synthetic: demo })
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
        'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' })
      res.end(html)
    } catch { res.writeHead(500, { 'Cache-Control': 'no-store' }); res.end('Demo unavailable') }
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT ?? '4311')
  if (!Number.isSafeInteger(port) || port < 1024 || port > 65535) throw new Error('PORT must be an integer from 1024 to 65535')
  const demo = process.argv.includes('--demo')
  const server = createDisplayServer({ demo,
    baseUrl: process.env.POINTMOON_BASE_URL,
    apiKey: process.env.POINTMOON_API_KEY,
  })
  server.listen(port, '127.0.0.1', () => console.log(`Open http://127.0.0.1:${port} (${demo ? 'SYNTHETIC demo' : 'live API, fixed Boston coordinate'})`))
  server.on('error', () => { console.error('Local demo could not start'); process.exitCode = 1 })
}
