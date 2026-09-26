import assert from 'node:assert/strict'
import { test } from 'node:test'
import { once } from 'node:events'
import { get } from 'node:http'
import { fetchContext, projectWeather, renderDisplay, selectCard, syntheticPayload } from './context.mjs'
import { createDisplayServer, isLoopbackSocket } from './server.mjs'
const NOW = Date.parse('2026-09-26T12:00:00Z')
const payload = (changes = {}) => {
  const result = syntheticPayload(NOW, 25)
  Object.assign(result.facts.fieldSnapshot.weather.current, changes)
  return result
}

test('project only supported weather; retain notices', () => {
  const p = payload(), context = projectWeather(p, NOW)
  assert.equal(context.status, 'current')
  assert.equal(context.weather.temperatureC, 25)
  assert.deepEqual(context.notices, p.notices)
  assert.equal(context.notices.attributionRequired, false)
  assert.equal(context.notices.sources[0].source, 'synthetic-example')
})
for (const [change, reason] of [
  [{ ttlMinutes: null }, 'unknown-freshness'], [{ ttlMinutes: 1e20 }, 'unknown-freshness'], [{ ttlMinutes: 0 }, 'unknown-freshness'],
  [{ observedAt: 'bad' }, 'unknown-freshness'], [{ observedAt: '2026-09-27T12:00:00Z' }, 'future-reading'],
  [{ observedAt: '2026-09-25T12:00:00Z' }, 'stale'], [{ source: '' }, 'missing-source'],
  [{ temperatureC: '25' }, 'missing-temperature'], [{ temperatureC: NaN }, 'missing-temperature'],
  [{ silent: true }, 'not-reported'], [{ provider: 'unresolved' }, 'not-reported'],
]) test(`missing or invalid evidence is not current: ${JSON.stringify(change)}`, () => {
  const context = projectWeather(payload(change), NOW)
  assert.equal(context.status, 'unavailable'); assert.equal(context.reason, reason)
  assert.equal(selectCard(context).id, 'menu')
})
test('expiry is exclusive and missing readings are handled', () => {
  assert.equal(projectWeather(payload(), NOW + 300_000).reason, 'stale')
  for (const p of [null, {}, { silent: true }, { facts: { fieldSnapshot: { weather: null } } }]) assert.equal(projectWeather(p, NOW).status, 'unavailable')
})
test('application selects different authored content; no source mutation', () => {
  for (const [temperatureC, id] of [[8, 'warm-drinks'], [18, 'menu'], [27, 'cool-drinks']]) {
    const context = projectWeather(payload({ temperatureC }), NOW), before = JSON.stringify(context)
    assert.equal(selectCard(context).id, id)
    assert.equal(JSON.stringify(context), before)
  }
})
test('developer can supply an independent selector', () => {
  const result = selectCard(projectWeather(payload(), NOW), [{ id: 'custom', title: 'Custom', text: 'My content', matches: () => true }])
  assert.equal(result.id, 'custom'); assert.equal(result.selectedBy, 'application-rule')
  assert.equal('evidencePaths' in result, false)
})
test('display escapes upstream strings and labels synthetic data', () => {
  const p = payload({ source: '<script>bad()</script>' }); p.notices = ['</pre><script>bad()</script>']
  const html = renderDisplay(projectWeather(p, NOW), { synthetic: true })
  assert.ok(html.includes('SYNTHETIC DEMO')); assert.ok(!html.includes('<script>'))
  assert.ok(html.includes('&lt;script&gt;')); assert.ok(html.includes('Reading time:'))
})
test('failed context renders a normal fallback, not fabricated conditions', () => {
  const html = renderDisplay(projectWeather(null, NOW))
  assert.ok(html.includes('Context unavailable')); assert.ok(!html.includes('°C'))
})
test('HTTP uses public projection and secret only in a header', async () => {
  await fetchContext({ lat: 42, lng: -71, apiKey: 'test-only-key', fetcher: async (url, init) => {
    assert.equal(url.searchParams.get('surface'), 'open'); assert.equal(url.searchParams.get('audience'), 'facts')
    assert.ok(!url.toString().includes('test-only-key'))
    assert.equal(init.headers.Authorization, 'Bearer test-only-key'); assert.equal(init.redirect, 'error')
    assert.equal(init.cache, 'no-store'); assert.ok(init.signal)
    return Response.json(payload())
  } })
})
test('HTTP failures do not expose key, coordinates or raw provider error', async () => {
  await assert.rejects(fetchContext({ lat: 42, lng: -71, apiKey: 'secret', fetcher: async () => { throw new Error('secret/private/path') } }), { message: 'Pointmoon request unavailable' })
  await assert.rejects(fetchContext({ lat: 42, lng: -71, fetcher: async () => Response.json({ error: 'sensitive' }, { status: 401 }) }), { message: 'Pointmoon HTTP 401' })
})
test('invalid locations and insecure remote hosts never trigger a request', async () => {
  let calls = 0; const fetcher = async () => { calls++; return Response.json(payload()) }
  for (const config of [{ lat: 91, lng: 0 }, { lat: 0, lng: '0' }, { lat: 0, lng: 0, baseUrl: 'http://remote.example' }, { lat: 0, lng: 0, baseUrl: 'https://user:pass@example.com' }]) await assert.rejects(fetchContext({ ...config, fetcher }))
  assert.equal(calls, 0)
})
test('unexpected payloads fail explicitly; typed silence is accepted', async () => {
  await assert.rejects(fetchContext({ lat: 0, lng: 0, fetcher: async () => Response.json({ wrong: true }) }), { message: 'Invalid Pointmoon response' })
  assert.deepEqual(await fetchContext({ lat: 0, lng: 0, fetcher: async () => Response.json({ silent: true }) }), { silent: true })
})
test('local display serves HTML, coalesces upstream reads, blocks proxy parameters and never exposes key', async (t) => {
  let calls = 0
  const server = createDisplayServer({ now: () => NOW, apiKey: 'server-only-secret', fetcher: async () => { calls++; return Response.json(payload()) } })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  t.after(() => new Promise((resolve) => server.close(resolve)))
  const origin = `http://127.0.0.1:${server.address().port}`
  const responses = await Promise.all([fetch(origin), fetch(origin)])
  for (const response of responses) {
    assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store')
    const text = await response.text(); assert.ok(!text.includes('server-only-secret')); assert.ok(text.includes('Cold drinks'))
  }
  assert.equal(calls, 1)
  assert.equal((await fetch(`${origin}/?lat=1&lng=1`)).status, 404)
  const forbiddenStatus = await new Promise((resolve, reject) => {
    get(origin, { headers: { Host: 'attacker.example' } }, (response) => { response.resume(); resolve(response.statusCode) }).on('error', reject)
  })
  assert.equal(forbiddenStatus, 403)
})
test('synthetic mode requires no API and is visibly labelled', async (t) => {
  const server = createDisplayServer({ demo: true, now: () => NOW, fetcher: async () => { throw new Error('should not fetch') } })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  t.after(() => new Promise((resolve) => server.close(resolve)))
  const text = await (await fetch(`http://127.0.0.1:${server.address().port}`)).text()
  assert.ok(text.includes('SYNTHETIC DEMO')); assert.ok(text.includes('synthetic-example'))
})


test('object-shaped attribution notices survive both current and unavailable projections', () => {
  const p = payload()
  p.notices = { attributionRequired: true, sources: [{ source: 'test-provider', attribution: 'Preserve this credit', license: 'test-licence' }] }
  for (const instant of [NOW, NOW + 600_000]) {
    const context = projectWeather(p, instant)
    assert.deepEqual(context.notices, p.notices)
    const html = renderDisplay(context)
    assert.ok(html.includes('Preserve this credit'))
    assert.ok(html.includes('attributionRequired'))
  }
})

test('custom selectors declare their own evidence dependencies', () => {
  const paths = ['facts.fieldSnapshot.weather.current.windKph']
  const result = selectCard(projectWeather(payload(), NOW), [{ id: 'wind', title: 'Wind', text: 'My content', matches: (c) => c.weather.windKph === 8, evidencePaths: paths }])
  assert.deepEqual(result.evidencePaths, paths)
  assert.notEqual(result.evidencePaths, paths)
  const defaultRule = selectCard(projectWeather(payload(), NOW))
  assert.deepEqual(defaultRule.evidencePaths, ['facts.fieldSnapshot.weather.current.temperatureC'])
})

test('exported server socket guard cannot be bypassed with a forged Host header', () => {
  for (const address of ['127.0.0.1', '::1', '::ffff:127.0.0.1']) {
    assert.equal(isLoopbackSocket({ localAddress: address, remoteAddress: address }), true)
  }
  assert.equal(isLoopbackSocket({ localAddress: '192.0.2.10', remoteAddress: '192.0.2.11' }), false)
  assert.equal(isLoopbackSocket({ localAddress: '127.0.0.1', remoteAddress: '192.0.2.11' }), false)
  assert.equal(isLoopbackSocket({ localAddress: '0.0.0.0', remoteAddress: '127.0.0.1' }), false)
  assert.equal(isLoopbackSocket(null), false)
})
