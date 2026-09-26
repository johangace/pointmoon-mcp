// Consumer-side projection and extension example. No Pointmoon engine implementation.
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const finite = (value) => typeof value === 'number' && Number.isFinite(value)

export function projectWeather(payload, now = Date.now()) {
  const reading = payload?.facts?.fieldSnapshot?.weather?.current
  // Preserve the hosted object-shaped trust block, including attributionRequired.
  const notices = isObject(payload?.notices) || Array.isArray(payload?.notices) ? payload.notices : null
  const unknown = (reason) => ({ status: 'unavailable', reason, notices, weather: null })
  if (!isObject(payload) || payload.silent === true || !isObject(reading) || reading.silent === true ||
      reading.resolutionStatus === 'unresolved' || reading.provider === 'unresolved') return unknown('not-reported')
  const observed = typeof reading.observedAt === 'string' ? Date.parse(reading.observedAt) : NaN
  const ttl = reading.ttlMinutes
  // A missing TTL is not permission to invent a freshness window. Future readings
  // are not treated as current observations by this deliberately narrow example.
  if (!Number.isFinite(now) || !Number.isFinite(observed) || !finite(ttl) || ttl <= 0) return unknown('unknown-freshness')
  if (observed > now) return unknown('future-reading')
  const expires = observed + ttl * 60_000
  if (!Number.isFinite(expires) || !Number.isFinite(new Date(expires).getTime())) return unknown('unknown-freshness')
  if (expires <= now) return unknown('stale')
  if (typeof reading.source !== 'string' || !reading.source.trim()) return unknown('missing-source')
  if (!finite(reading.temperatureC)) return unknown('missing-temperature')
  return { status: 'current', reason: null, notices, weather: {
    temperatureC: reading.temperatureC,
    windKph: finite(reading.windKph) ? reading.windKph : null,
    source: reading.source,
    observedAt: new Date(observed).toISOString(),
    validUntil: new Date(expires).toISOString(),
  } }
}

// These cards and thresholds are authored by the DEMO APPLICATION, not Pointmoon.
export const DEMO_CARDS = [
  { id: 'cool-drinks', title: 'Cold drinks', text: 'Show the cafe’s cold-drinks collection.', matches: (context) => context.weather?.temperatureC >= 23, evidencePaths: ['facts.fieldSnapshot.weather.current.temperatureC'] },
  { id: 'warm-drinks', title: 'Something warm', text: 'Show the cafe’s hot-drinks collection.', matches: (context) => context.weather?.temperatureC <= 10, evidencePaths: ['facts.fieldSnapshot.weather.current.temperatureC'] },
]
const DEFAULT_CARD = { id: 'menu', title: 'Explore the menu', text: 'Show the regular collection. No weather-specific claim is needed.' }

/** Replace cards with your own pure selectors. Source evidence is not rewritten. */
export function selectCard(context, cards = DEMO_CARDS) {
  const selected = context.status === 'current' ? cards.find((card) => card.matches(context)) : null
  const { id, title, text } = selected ?? DEFAULT_CARD
  const declaredPaths = selected?.evidencePaths
  return { id, title, text, selectedBy: 'application-rule',
    ...(Array.isArray(declaredPaths) && declaredPaths.every((path) => typeof path === 'string')
      ? { evidencePaths: [...declaredPaths] } : {}) }
}

export async function fetchContext({ lat, lng, baseUrl = 'https://pointmoon.ai', apiKey, fetcher = fetch, timeoutMs = 45_000 }) {
  if (!finite(lat) || lat < -90 || lat > 90 || !finite(lng) || lng < -180 || lng > 180) throw new Error('Invalid coordinates')
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) throw new Error('Invalid timeout')
  const base = new URL(baseUrl)
  const local = ['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname)
  if ((base.protocol !== 'https:' && !(base.protocol === 'http:' && local)) || base.username || base.password || base.search || base.hash) throw new Error('Use HTTPS or a loopback development host')
  const url = new URL('/api/moon', base)
  url.search = new URLSearchParams({ audience: 'facts', surface: 'open', lat: String(lat), lng: String(lng) }).toString()
  const headers = { Accept: 'application/json' }
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`
  let response
  try { response = await fetcher(url, { headers, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) }) }
  catch { throw new Error('Pointmoon request unavailable') }
  if (!response.ok) throw new Error(`Pointmoon HTTP ${response.status}`)
  let payload
  try { payload = await response.json() } catch { throw new Error('Invalid Pointmoon response') }
  if (!isObject(payload) || (!isObject(payload.facts) && payload.silent !== true)) throw new Error('Invalid Pointmoon response')
  return payload
}

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])
export function renderDisplay(context, { synthetic = false } = {}) {
  const card = selectCard(context)
  const w = context.weather
  const status = w ? `<p class="value">${escapeHtml(w.temperatureC)}°C</p><p>Source: ${escapeHtml(w.source)}</p><p>Reading time: ${escapeHtml(w.observedAt)}</p><p>Freshness window ends: ${escapeHtml(w.validUntil)}</p>`
    : `<p class="value">Context unavailable</p><p>${escapeHtml(context.reason)}. Showing the standard content.</p>`
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="60"><title>Pointmoon · responsive content example</title><style>body{font:18px/1.6 system-ui,sans-serif;max-width:860px;margin:3rem auto;padding:0 1.5rem;background:#f5f4ef;color:#18241c}h1{font-size:clamp(2rem,6vw,4rem);line-height:1.1}article{padding:1.5rem;border:1px solid #bac4b8;border-radius:12px;margin:1.5rem 0;background:white}.value{font-size:2rem}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:.8rem}small{display:block}a{color:inherit}</style></head><body><small>${synthetic ? 'SYNTHETIC DEMO · NOT LIVE CONDITIONS' : 'LIVE API EXAMPLE · FIXED LOCATION'}</small><h1>Content that changes with context.</h1><article aria-label="Application content"><small>Selected by this application’s rule</small><h2>${escapeHtml(card.title)}</h2><p>${escapeHtml(card.text)}</p></article><article aria-label="Source context">${status}<small>This is provider-reported context, not a verified measurement at this exact spot.</small></article><details><summary>Source notices</summary><pre>${escapeHtml(JSON.stringify(context.notices, null, 2))}</pre></details><p>Updates every minute. API credentials remain on the server.</p></body></html>`
}

/** Synthetic input is opt-in and explicitly labelled by the display. */
export function syntheticPayload(now = Date.now(), temperatureC = 25) {
  return { facts: { fieldSnapshot: { weather: { current: {
    source: 'synthetic-example', observedAt: new Date(now).toISOString(), ttlMinutes: 5,
    temperatureC, windKph: 8,
  } } } }, notices: { attributionRequired: false, sources: [{ source: 'synthetic-example', attribution: 'Invented data for testing; not actual conditions.' }] } }
}
