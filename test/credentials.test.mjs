import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

// Synthetic credentials used only with local stub servers; never real keys.
const KEY = 'fixture_pointmoon_credential_not_real'
const BIRD_KEY = 'fixture_ebird_credential_not_real'
const CLI = process.env.POINTMOON_TEST_CLI || fileURLToPath(new URL('../bin/pointmoon-mcp.mjs', import.meta.url))
const facts = { facts: { signals: [{ id: 'fixture', source: 'test', value: 1 }] }, provenance: { mode: 'fixture' } }
const call = (name = 'field_truth', args = { lat: 42.36, lng: -71.06 }) => ({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name, arguments: args } })

async function stub(t, respond = (_req, res) => res.end(JSON.stringify(facts))) {
  const requests = []
  const server = createServer(async (req, res) => {
    let body = ''
    for await (const part of req) body += part
    requests.push({ url: req.url, headers: req.headers, method: req.method, body })
    res.setHeader('content-type', 'application/json')
    respond(req, res)
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => new Promise((resolve) => {
    server.close(resolve)
    server.closeAllConnections()
  }))
  return { url: `http://127.0.0.1:${server.address().port}`, requests }
}

async function run(base, messages = [call()], key = '', extra = {}) {
  // No inherited provider tokens, NODE_OPTIONS, or real Pointmoon credentials.
  const child = spawn(process.execPath, [CLI], {
    env: { PATH: process.env.PATH, POINTMOON_BASE_URL: base, POINTMOON_API_KEY: key, ...extra },
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', (part) => { stdout += part })
  child.stderr.on('data', (part) => { stderr += part })
  const timer = setTimeout(() => child.kill('SIGKILL'), 8000)
  child.stdin.end(messages.map((item) => typeof item === 'string' ? item : JSON.stringify(item)).join('\n') + '\n')
  try {
    const [code, signal] = await once(child, 'close')
    assert.equal(signal, null, 'connector did not exit before test deadline')
    assert.equal(code, 0, 'connector process should remain usable after a request error')
    return { stdout, stderr, messages: stdout.trim().split('\n').filter(Boolean).map(JSON.parse) }
  } finally {
    clearTimeout(timer)
    if (child.exitCode === null) child.kill()
  }
}

function result(output) { return output.messages.find((message) => message.id === 3).result }
function clean(output) {
  for (const secret of [KEY, BIRD_KEY]) {
    assert.ok(!output.stdout.includes(secret), 'synthetic credential entered MCP stdout')
    assert.ok(!output.stderr.includes(secret), 'synthetic credential entered stderr')
  }
}
function failed(output, code, status) {
  clean(output)
  const value = result(output)
  assert.equal(value.isError, true)
  assert.equal(value.structuredContent.error, code)
  if (status !== undefined) assert.equal(value.structuredContent.status, status)
  assert.equal(value.structuredContent.silent, undefined)
  return value
}

test('configured key is header-only; discovery and field payload stay unchanged', async (t) => {
  const host = await stub(t)
  const output = await run(host.url, [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    call('field_truth', { place: 'Boston', ebirdApiKey: BIRD_KEY }),
  ], KEY)
  clean(output)
  assert.equal(output.messages.length, 3)
  assert.equal(host.requests.length, 1)
  const request = host.requests[0]
  assert.equal(request.headers.authorization, `Bearer ${KEY}`)
  assert.equal(request.headers['x-ebird-api-token'], BIRD_KEY)
  assert.ok(!request.url.includes(KEY) && !request.url.includes(BIRD_KEY))
  const params = new URL(request.url, host.url).searchParams
  assert.equal(params.get('surface'), 'open')
  assert.equal(params.get('audience'), 'facts')
  assert.equal(params.get('adapterMode'), 'live')
  assert.deepEqual(result(output).structuredContent, facts)
  for (const tool of output.messages.find((message) => message.id === 2).result.tools) {
    assert.equal(tool.inputSchema.properties.pointmoonApiKey, undefined)
    assert.equal(tool.inputSchema.properties.apiKey, undefined)
  }
})

test('anonymous calls still work and have no Authorization header', async (t) => {
  const host = await stub(t)
  const output = await run(host.url)
  assert.equal(host.requests[0].headers.authorization, undefined)
  assert.deepEqual(result(output).structuredContent, facts)
})

test('step_outside receives the same configured identity', async (t) => {
  const payload = { verdict: 'go', timing: 'now', because: [] }
  const host = await stub(t, (_req, res) => res.end(JSON.stringify(payload)))
  const output = await run(host.url, [call('step_outside')], KEY)
  clean(output)
  assert.equal(host.requests[0].headers.authorization, `Bearer ${KEY}`)
  assert.equal(new URL(host.requests[0].url, host.url).pathname, '/api/step-outside')
  assert.deepEqual(result(output).structuredContent, payload)
})

test('legacy POST and GET also use header credentials without serializing them', async (t) => {
  const host = await stub(t, (_req, res) => res.end(JSON.stringify({ packet: {}, decisionSeam: {} })))
  for (const name of ['moon_packet', 'decision_seam']) {
    clean(await run(host.url, [call(name)], KEY))
  }
  assert.deepEqual(host.requests.map((request) => request.method), ['GET', 'POST'])
  for (const request of host.requests) {
    assert.equal(request.headers.authorization, `Bearer ${KEY}`)
    assert.ok(!request.url.includes(KEY) && !request.body.includes(KEY))
  }
})

for (const [status, code] of [[400, 'invalid_request'], [401, 'unauthorized'], [403, 'forbidden'], [429, 'rate_limited'], [503, 'http_error']]) {
  test(`HTTP ${status} is a sanitized tool error, never anonymous retry or silence`, async (t) => {
    const host = await stub(t, (_req, res) => {
      res.statusCode = status
      res.setHeader('retry-after', '45')
      res.end(JSON.stringify({ error: KEY, detail: BIRD_KEY, internal: '/private/runtime' }))
    })
    const output = await run(host.url, [call()], KEY)
    const value = failed(output, code, status)
    assert.equal(value.structuredContent.retryAfterSeconds, 45)
    assert.ok(!output.stdout.includes('/private/runtime'))
    assert.equal(host.requests.length, 1, 'invalid key must not fall back to anonymous')
  })
}

test('untrusted Retry-After text is omitted rather than echoed', async (t) => {
  const host = await stub(t, (_req, res) => {
    res.statusCode = 429
    res.setHeader('retry-after', KEY)
    res.end('ignored')
  })
  const value = failed(await run(host.url, [call()], KEY), 'rate_limited', 429)
  assert.equal(value.structuredContent.retryAfterSeconds, undefined)
})

for (const status of [302, 307]) {
  test(`HTTP ${status} is not followed to another origin with either credential`, async (t) => {
    const other = await stub(t)
    const host = await stub(t, (_req, res) => {
      res.statusCode = status
      res.setHeader('location', `${other.url}/collect`)
      res.end(KEY)
    })
    failed(await run(host.url, [call('field_truth', { place: 'Boston', ebirdApiKey: BIRD_KEY })], KEY), 'http_error', status)
    assert.equal(host.requests.length, 1)
    assert.equal(other.requests.length, 0)
  })
}

test('same-origin redirects are refused too', async (t) => {
  const host = await stub(t, (req, res) => {
    if (req.url.startsWith('/api/moon')) {
      res.statusCode = 307
      res.setHeader('location', '/unexpected-route')
    }
    res.end('{}')
  })
  failed(await run(host.url, [call()], KEY), 'http_error', 307)
  assert.equal(host.requests.length, 1)
})

test('success-status error envelope is not environmental silence', async (t) => {
  const host = await stub(t, (_req, res) => res.end(JSON.stringify({ error: KEY })))
  failed(await run(host.url, [call()], KEY), 'upstream_error', 200)
})

test('HTML/malformed JSON never echoes its body or a parser snippet', async (t) => {
  const host = await stub(t, (_req, res) => res.end(`<html>${KEY} ${BIRD_KEY}</html>`))
  failed(await run(host.url, [call()], KEY), 'request_failed')
})

for (const body of ['null', '[]', '"not a field response"']) {
  test(`invalid success JSON shape ${body} is a tool error`, async (t) => {
    const host = await stub(t, (_req, res) => res.end(body))
    failed(await run(host.url, [call()], KEY), 'invalid_response', 200)
  })
}

test('valid typed silence remains a successful tool result', async (t) => {
  const payload = { silent: true, reason: 'substrate-thin', meta: {} }
  const host = await stub(t, (_req, res) => res.end(JSON.stringify(payload)))
  const output = await run(host.url, [call('step_outside')], KEY)
  assert.notEqual(result(output).isError, true)
  assert.deepEqual(result(output).structuredContent, payload)
})

test('tool arguments cannot smuggle a credential or change the destination', async (t) => {
  const host = await stub(t)
  for (const extra of [{ apiKey: KEY }, { pointmoonApiKey: KEY }, { authorization: KEY }, { baseUrl: host.url }]) {
    failed(await run(host.url, [call('field_truth', { place: 'Boston', ...extra })], KEY), 'invalid_arguments')
  }
  assert.equal(host.requests.length, 0)
})

test('invalid local configuration fails before outbound calls and never prints values', async (t) => {
  const host = await stub(t)
  for (const base of ['not a url', 'http://example.com', 'http://localhost', `https://${KEY}:password@example.com`, `${host.url}?key=${KEY}`, `${host.url}#${KEY}`, 'file:///tmp/test']) {
    failed(await run(base, [call()], KEY), 'invalid_config')
  }
  for (const key of [' ', `${KEY}\nheader`, `Bearer ${KEY}`]) {
    failed(await run(host.url, [call()], key), 'invalid_config')
  }
  assert.equal(host.requests.length, 0)
})

test('discovery is local and does not require an API request or key', async (t) => {
  const host = await stub(t)
  const output = await run(host.url, [{ jsonrpc: '2.0', id: 1, method: 'tools/list' }], KEY)
  clean(output)
  assert.ok(output.messages[0].result.tools.length >= 2)
  assert.equal(host.requests.length, 0)
})

test('malformed JSON on stdin does not leak parser excerpts and ping still works', async (t) => {
  const host = await stub(t)
  const output = await run(host.url, [`{"apiKey":"${KEY}", invalid`, { jsonrpc: '2.0', id: 4, method: 'ping' }], KEY)
  clean(output)
  assert.equal(output.messages[0].error.code, -32700)
  assert.equal(output.messages[0].error.data, undefined)
  assert.deepEqual(output.messages[1].result, {})
})
