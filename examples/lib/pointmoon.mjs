// Minimal zero-dependency client for Pointmoon's hosted MCP server.
//
// Nothing to install: this file uses only Node built-ins (global `fetch`,
// Node 18+). It speaks the MCP Streamable HTTP transport directly, which for a
// stateless read-only server like Pointmoon is one HTTP POST carrying a
// JSON-RPC request, answered with a `text/event-stream` frame.
//
// Point it somewhere else with POINTMOON_BASE_URL (used by the CI failure
// drill and by anyone running Pointmoon locally).

export const BASE_URL = process.env.POINTMOON_BASE_URL || 'https://pointmoon.vercel.app'
export const MCP_URL = new URL('/api/mcp', BASE_URL).toString()
export const HTTP_URL = new URL('/api/moon', BASE_URL).toString()

let nextId = 1

/**
 * Read a JSON-RPC response out of an MCP Streamable HTTP reply.
 * The server answers `text/event-stream`, so the payload arrives as one or
 * more `data: {...}` lines. A server that answers plain JSON is handled too.
 */
function parseMcpBody(body, id) {
  const trimmed = body.trim()

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return JSON.parse(trimmed)
  }

  const frames = []
  for (const line of trimmed.split(/\r?\n/)) {
    if (!line.startsWith('data:')) continue
    const raw = line.slice(5).trim()
    if (!raw || raw === '[DONE]') continue
    try {
      frames.push(JSON.parse(raw))
    } catch {
      // Not a JSON-RPC frame (keep-alive, comment). Ignore it.
    }
  }

  const match = frames.find((f) => f && f.id === id)
  if (match) return match
  if (frames.length > 0) return frames[frames.length - 1]

  throw new Error(`No JSON-RPC frame in MCP response. Raw body:\n${body.slice(0, 500)}`)
}

async function rpc(method, params, { timeoutMs = 45000 } = {}) {
  const id = nextId++
  let res
  try {
    res = await fetch(MCP_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        // Streamable HTTP requires the client to accept both.
        accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (error) {
    throw new Error(`Could not reach ${MCP_URL}: ${error?.message || error}`)
  }

  const body = await res.text()
  if (!res.ok) {
    throw new Error(`${MCP_URL} returned HTTP ${res.status}. Body:\n${body.slice(0, 500)}`)
  }

  const message = parseMcpBody(body, id)
  if (message.error) {
    throw new Error(`MCP error ${message.error.code}: ${message.error.message}`)
  }
  return message.result
}

/** List the tools the hosted server exposes. */
export function listTools(options) {
  return rpc('tools/list', undefined, options).then((r) => r.tools || [])
}

/**
 * Call the `field_truth` tool.
 * Pass `{ lat, lng }` for an exact coordinate, or `{ place }` for a name.
 * Returns the tool's `structuredContent` — the `audience=facts` envelope.
 */
export async function fieldTruth(args = {}, options) {
  const result = await rpc('tools/call', { name: 'field_truth', arguments: args }, options)
  const payload = result.structuredContent
  if (!payload) {
    const text = result.content?.map((c) => c.text).join('\n') || '(no content)'
    throw new Error(`field_truth returned no structuredContent. Text was:\n${text}`)
  }
  return { payload, summary: result.content?.[0]?.text ?? '' }
}

/** The same field-truth over plain HTTP, with no MCP at all. */
export async function fieldTruthOverHttp(query = {}, { timeoutMs = 45000 } = {}) {
  const url = new URL(HTTP_URL)
  url.searchParams.set('audience', 'facts')
  url.searchParams.set('surface', 'open')
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue
    url.searchParams.set(key, String(value))
  }

  let res
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
  } catch (error) {
    throw new Error(`Could not reach ${url}: ${error?.message || error}`)
  }
  const body = await res.text()
  if (!res.ok) {
    throw new Error(`${url} returned HTTP ${res.status}. Body:\n${body.slice(0, 500)}`)
  }
  return JSON.parse(body)
}

/** Every sourced token Pointmoon stands behind, flat. */
export function signals(payload) {
  return payload?.facts?.signals ?? []
}

/**
 * The freshness envelope for a reading. Signals are lean (id/source/value/
 * confidence); the timestamp and the producer-declared freshness window live on
 * the matching `fieldSnapshot` reading.
 */
export function weatherReading(payload) {
  return payload?.facts?.fieldSnapshot?.weather?.current ?? null
}

/**
 * Axes that could not be grounded. Typed silence is a normal answer, not an
 * error: an axis Pointmoon cannot stand behind is `null`, or marks its provider
 * `"unresolved"` with a reason. It is never a plausible-looking number.
 */
export function silentAxes(payload) {
  const snapshot = payload?.facts?.fieldSnapshot ?? {}
  const quiet = []
  for (const [axis, reading] of Object.entries(snapshot)) {
    if (reading === null) {
      quiet.push({ axis, reason: 'null-axis' })
      continue
    }
    if (reading && typeof reading === 'object') {
      if (reading.silent === true) {
        quiet.push({ axis, reason: reading.reason ?? 'silent' })
      } else if (reading.resolutionStatus === 'unresolved' || reading.provider === 'unresolved') {
        quiet.push({ axis, reason: reading.resolutionReason ?? 'unresolved' })
      }
    }
  }
  return quiet
}

/**
 * The assertion every example ends with, and the thing CI is really watching.
 *
 * A run that returns zero sourced signals is a FAILURE, not an empty success:
 * it means the hosted server stopped grounding, or the response shape moved
 * under us. Throwing here is what makes `examples/run-all.mjs` — and therefore
 * the GitHub Actions job — go red.
 */
export function assertClaims(payload, label = 'field_truth') {
  const list = signals(payload)
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error(
      `${label}: expected at least one sourced signal in facts.signals[], got ${
        Array.isArray(list) ? 0 : typeof list
      }. Pointmoon returned no claims.`
    )
  }
  const unsourced = list.filter((s) => !s.source)
  if (unsourced.length > 0) {
    throw new Error(
      `${label}: ${unsourced.length} signal(s) carry no \`source\`. Every claim must be sourced.`
    )
  }
  return list
}

/** Pretty-print a handful of signals as `label: value  [source, confidence]`. */
export function printSignals(list, limit = 8) {
  for (const signal of list.slice(0, limit)) {
    const value = typeof signal.value === 'object' ? JSON.stringify(signal.value) : signal.value
    console.log(
      `  ${String(signal.label ?? signal.id).padEnd(26)} ${String(value).padEnd(18)} ` +
        `[source: ${signal.source}, confidence: ${signal.confidence}]`
    )
  }
  if (list.length > limit) console.log(`  ... and ${list.length - limit} more`)
}
