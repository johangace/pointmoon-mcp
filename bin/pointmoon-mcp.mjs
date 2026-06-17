#!/usr/bin/env node

import readline from 'node:readline'

const PROTOCOL_VERSION = '2025-03-26'
// Public default: a stranger's agent reaches real data with no local Pointmoon.
// Override with POINTMOON_BASE_URL=http://127.0.0.1:3110 for local dev.
const DEFAULT_BASE_URL = 'https://pointmoon.vercel.app'
const baseUrl = process.env.POINTMOON_BASE_URL || DEFAULT_BASE_URL

const LOCATION_PROPERTIES = {
  lat: {
    type: 'number',
    description: 'Latitude in decimal degrees (WGS84), e.g. 42.36. REQUIRED.',
    minimum: -90,
    maximum: 90,
  },
  lng: {
    type: 'number',
    description: 'Longitude in decimal degrees (WGS84), e.g. -71.06. REQUIRED.',
    minimum: -180,
    maximum: 180,
  },
  city: {
    type: 'string',
    description:
      'Optional human-readable place label (e.g. "Boston") used only for logging/echo. It does NOT geolocate; lat/lng decide the location. Omit if unknown.',
  },
}

const ADAPTER_MODE_PROPERTY = {
  type: 'string',
  enum: ['live', 'simulated', 'fixture'],
  description:
    'Data source. "live" (default) hits real upstream providers for the coordinate. "simulated"/"fixture" return deterministic non-real data for testing only — do not use for real answers.',
  default: 'live',
}

const tools = [
  {
    name: 'field_truth',
    title: 'Pointmoon Field Truth',
    description:
      'Get sourced, current physical and environmental field-truth for a geographic coordinate. ' +
      'Call this when you need VERIFIED present-moment conditions at a place — weather, air quality, ' +
      'light/sky, water, terrain, notable natural events — and you must not guess. ' +
      'Returns an array of discrete factual claims; each claim carries its own source (which provider ' +
      'observed it), observedAt (when it was observed), ttlMinutes (how long it stays fresh), and ' +
      'confidence (0–1). Also returns a typed trust block and silence contract. ' +
      'SILENCE CONTRACT: when a fact is unknown, stale, or low-confidence, this tool returns an explicit ' +
      'silence ({ active: true, reason }) or simply omits that claim — it never fabricates a value. ' +
      'Treat the returned claims as the only verified facts; do not invent conditions it did not report. ' +
      'Pointmoon emits observational tokens, not prose — render the claims into your own wording.',
    inputSchema: {
      type: 'object',
      properties: {
        lat: {
          ...LOCATION_PROPERTIES.lat,
          description:
            'Latitude in decimal degrees (WGS84), e.g. 42.36. Provide lat AND lng for an exact location, OR use `place` for a name. lat/lng win when both are given.',
        },
        lng: {
          ...LOCATION_PROPERTIES.lng,
          description: 'Longitude in decimal degrees (WGS84), e.g. -71.06. Pair with `lat`.',
        },
        place: {
          type: 'string',
          description:
            'A place name to geocode, e.g. "Boston" or "Yosemite Valley". Use this when you do NOT have coordinates; Pointmoon resolves it to a lat/lng, or returns typed silence if it cannot. Provide either `place` or lat/lng.',
        },
        city: LOCATION_PROPERTIES.city,
        adapterMode: ADAPTER_MODE_PROPERTY,
        includeFieldSnapshot: {
          type: 'boolean',
          description: 'Include the raw upstream field snapshot alongside the claims (verbose; usually false).',
          default: false,
        },
        ebirdApiKey: {
          type: 'string',
          description:
            'Optional bring-your-own eBird API token. eBird data is licensed for non-commercial use only unless you have Cornell Lab permission, so on this public surface bird observations are returned ONLY when you supply your own key (sent as a header, not logged). Omit it and the bird axis stays silent. Free key: https://ebird.org/api/keygen',
        },
      },
      required: [],
    },
    annotations: {
      title: 'Field Truth',
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  {
    name: 'moon_packet',
    title: 'Pointmoon Packet (internal/legacy)',
    description:
      'INTERNAL / LEGACY — debug only. Returns the full pre-field-truth Pointmoon packet (opportunity ' +
      'summaries, renderer-facing output) for compatibility and deep inspection. ' +
      'Public agents should use field_truth instead; this tool exists for migrating consumers and debugging.',
    inputSchema: {
      type: 'object',
      properties: {
        ...LOCATION_PROPERTIES,
        adapterMode: ADAPTER_MODE_PROPERTY,
        days: { type: 'number', description: 'Optional day range for packet projection.' },
      },
      required: ['lat', 'lng'],
    },
    annotations: {
      title: 'Pointmoon Packet (internal/legacy)',
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  {
    name: 'decision_seam',
    title: 'Pointmoon Decision Seam (deprecated/internal)',
    description:
      'DEPRECATED / INTERNAL — debug only. Compatibility shim for surfacing/action judgment from older ' +
      'judgment clients. Prefer field_truth plus your own downstream rendering logic.',
    inputSchema: {
      type: 'object',
      properties: {
        ...LOCATION_PROPERTIES,
        adapterMode: ADAPTER_MODE_PROPERTY,
        surfaceMode: {
          type: 'string',
          enum: ['notification', 'ambient', 'assistant', 'card'],
          default: 'notification',
        },
        actionMode: {
          type: 'string',
          enum: ['observe-now', 'short-walk', 'timed-window'],
          default: 'observe-now',
        },
      },
      required: ['lat', 'lng'],
    },
    annotations: {
      title: 'Decision Seam (deprecated/internal)',
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
]

function writeMessage(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`)
}

function writeResponse(id, result) {
  writeMessage({ jsonrpc: '2.0', id, result })
}

function writeError(id, code, message, data) {
  writeMessage({
    jsonrpc: '2.0',
    id,
    error: {
      code,
      message,
      ...(data === undefined ? {} : { data }),
    },
  })
}

function toSearchParams(args = {}) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(args)) {
    if (value === undefined || value === null) continue
    params.set(key, String(value))
  }
  return params
}

async function callHttpGet(path, args, headers) {
  const url = new URL(path, baseUrl)
  url.search = toSearchParams(args).toString()
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(30000) })
  const json = await res.json()
  if (!res.ok) {
    throw new Error(JSON.stringify(json, null, 2))
  }
  return json
}

async function callHttpPost(path, args) {
  const url = new URL(path, baseUrl)
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(args ?? {}),
    signal: AbortSignal.timeout(30000),
  })
  const json = await res.json()
  if (!res.ok) {
    throw new Error(JSON.stringify(json, null, 2))
  }
  return json
}

function toToolResult(json, summary) {
  return {
    content: [
      {
        type: 'text',
        text: summary,
      },
    ],
    structuredContent: json,
  }
}

// JSON Schema `default` is advisory; many MCP clients do not apply it. Enforce
// the public default (live data) server-side so a bare call hits real providers.
function withAdapterDefault(args = {}) {
  if (args.adapterMode === undefined || args.adapterMode === null || args.adapterMode === '') {
    return { ...args, adapterMode: 'live' }
  }
  return args
}

async function handleToolCall(name, rawArgs = {}) {
  const args = withAdapterDefault(rawArgs)

  if (name === 'field_truth') {
    // Pin audience=facts: the lean, prose-free field-truth surface
    // ({ facts: { signals[], fieldSnapshot, meta }, provenance, trust }).
    // WITHOUT this, /api/moon defaults to the legacy `moon` packet, which
    // carries rendered prose (output.moon, packet.briefing.*) — exactly the
    // sentences Pointmoon refuses to write. The public agent tool must hand
    // back tokens for the agent to phrase, never pre-written copy.
    // The stdio server is a public surface too: pin surface=open so observation
    // sources are redistribution-clean (iNaturalist cc0,cc-by), and serve eBird
    // only from a caller-supplied key (sent as a header, never a query param so
    // it stays out of URL logs).
    const { ebirdApiKey, ...rest } = args
    const headers = ebirdApiKey ? { 'x-ebird-api-token': ebirdApiKey } : undefined
    const json = await callHttpGet(
      '/api/moon',
      { ...rest, audience: 'facts', surface: 'open' },
      headers
    )
    const signalCount = Array.isArray(json.facts?.signals) ? json.facts.signals.length : 0
    const locationLabel =
      typeof args.lat === 'number' && typeof args.lng === 'number'
        ? `${args.lat},${args.lng}`
        : args.place || 'the requested location'
    // Summary is a status line, not a claim — never echo a fact as prose.
    const summary =
      signalCount > 0
        ? `Pointmoon field-truth: ${signalCount} sourced signal${signalCount === 1 ? '' : 's'} for ${locationLabel} (each carries source/observedAt/ttlMinutes/confidence).`
        : `Pointmoon field-truth: substrate thin at ${locationLabel} — silence rather than a guess.`
    return toToolResult(json, summary)
  }

  if (name === 'moon_packet') {
    const json = await callHttpGet('/api/moon', args)
    return toToolResult(json, json.packet?.opportunity?.summary || 'Pointmoon packet returned.')
  }

  if (name === 'decision_seam') {
    const json = await callHttpPost('/api/decision-seam', {
      includeAgentContract: true,
      ...args,
    })
    return toToolResult(
      json,
      `${json.agentContract?.decision?.shouldSurface?.action ?? json.decisionSeam?.shouldSurface?.action ?? 'unknown'} / ${json.agentContract?.decision?.shouldAct?.action ?? json.decisionSeam?.shouldAct?.action ?? 'unknown'}`
    )
  }

  return {
    content: [{ type: 'text', text: `Unknown tool: ${name}` }],
    isError: true,
  }
}

async function handleRequest(message) {
  if (message.method === 'initialize') {
    writeResponse(message.id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {
        tools: {},
      },
      serverInfo: {
        name: 'pointmoon-mcp',
        version: '0.1.0',
      },
      instructions:
        'Pointmoon emits sourced field-truth (observational tokens with provenance, freshness, and ' +
        'confidence — or explicit silence) for a coordinate. Use field_truth for verified current ' +
        'physical/environmental conditions at a lat/lng; it never guesses. moon_packet and decision_seam ' +
        'are internal/legacy debug tools — public agents should only need field_truth.',
    })
    return
  }

  if (message.method === 'tools/list') {
    writeResponse(message.id, { tools })
    return
  }

  if (message.method === 'tools/call') {
    try {
      const result = await handleToolCall(message.params?.name, message.params?.arguments || {})
      writeResponse(message.id, result)
    } catch (error) {
      writeResponse(message.id, {
        content: [{ type: 'text', text: error?.message || String(error) }],
        isError: true,
      })
    }
    return
  }

  if (message.method === 'ping') {
    writeResponse(message.id, {})
    return
  }

  writeError(message.id, -32601, `Method not found: ${message.method}`)
}

async function main() {
  const rl = readline.createInterface({
    input: process.stdin,
    crlfDelay: Infinity,
  })

  for await (const line of rl) {
    if (!line.trim()) continue

    let payload
    try {
      payload = JSON.parse(line)
    } catch (error) {
      writeError(null, -32700, 'Parse error', error?.message)
      continue
    }

    const messages = Array.isArray(payload) ? payload : [payload]

    for (const message of messages) {
      if (!message || typeof message !== 'object') continue
      if (!('method' in message)) continue
      if (message.method === 'notifications/initialized') continue
      if (!('id' in message)) continue
      await handleRequest(message)
    }
  }
}

main().catch((error) => {
  console.error(error?.stack || error?.message || error)
  process.exit(1)
})
