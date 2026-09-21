#!/usr/bin/env node

import readline from 'node:readline'

const PROTOCOL_VERSION = '2025-03-26'
// Public default: a stranger's agent reaches real data with no local Pointmoon.
// Override with POINTMOON_BASE_URL=http://127.0.0.1:3110 for local dev.
const DEFAULT_BASE_URL = 'https://pointmoon.ai'
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

// field_truth and step_outside are copied verbatim from the hosted server's
// tools/list, so conformance compares like with like. Re-sync them from
// https://pointmoon.ai/api/mcp before each release (RELEASING.md step 3).
const tools = [
  {
    "name": "field_truth",
    "title": "Pointmoon Field Truth",
    "description": "Get sourced, current physical and environmental field-truth for a place — by coordinate (lat + lng) or by name (place). Call this when you need VERIFIED present-moment conditions — weather, air quality, light/sky, water, terrain, notable natural events — and you must not guess. Returns discrete sourced tokens in facts.signals[], each { id, source, label, value, confidence, evidence[] }, alongside facts.fieldSnapshot — the raw multi-axis snapshot whose readings carry the freshness envelope (observedAt, and ttlMinutes where the producer declares one) — and provenance, which names the provider that answered each source family. SILENCE CONTRACT: silence is per-axis and typed, never a top-level flag. An axis the substrate cannot stand behind is null, its node reports resolutionStatus \"unresolved\" with a resolutionReason, and its provider reads \"unresolved\" in provenance.providers. It never fabricates a value. Treat the returned tokens as the only verified facts; do not invent conditions it did not report. Pointmoon emits observational tokens, not prose — render the claims into your own wording.",
    "inputSchema": {
      "$schema": "http://json-schema.org/draft-07/schema#",
      "type": "object",
      "properties": {
        "lat": {
          "description": "Latitude in decimal degrees (WGS84), e.g. 42.36. Provide lat AND lng for an exact location, OR use `place` for a name. lat/lng win when both are given.",
          "type": "number",
          "minimum": -90,
          "maximum": 90
        },
        "lng": {
          "description": "Longitude in decimal degrees (WGS84), e.g. -71.06. Pair with `lat`.",
          "type": "number",
          "minimum": -180,
          "maximum": 180
        },
        "place": {
          "description": "A place name to geocode, e.g. \"Boston\" or \"Yosemite Valley\". Use this when you do NOT have coordinates; Pointmoon resolves it to a lat/lng. If it cannot resolve the name it returns typed silence rather than guessing. Provide either `place` or lat/lng.",
          "type": "string"
        },
        "city": {
          "description": "Optional human-readable label used only for logging/echo. It does NOT geolocate (use `place` for that, or lat/lng). Omit if unknown.",
          "type": "string"
        },
        "adapterMode": {
          "description": "Data source. \"live\" (default) hits real upstream providers. \"simulated\"/\"fixture\" return deterministic non-real data for testing only — do not use for real answers.",
          "type": "string",
          "enum": [
            "live",
            "simulated",
            "fixture"
          ]
        },
        "includeFieldSnapshot": {
          "description": "Include the raw upstream field snapshot alongside the claims (verbose; usually false).",
          "type": "boolean"
        },
        "ebirdApiKey": {
          "description": "Optional bring-your-own eBird API token. eBird data is licensed for non-commercial use only unless you have permission from the Cornell Lab — so on this public surface bird observations are returned ONLY when you supply your own key, making you the licensee. Omit it and the bird axis stays silent. Get a free key at https://ebird.org/api/keygen.",
          "type": "string"
        }
      }
    },
    "annotations": {
      "title": "Field Truth",
      "readOnlyHint": true,
      "idempotentHint": true,
      "openWorldHint": true
    }
  },
  {
    "name": "step_outside",
    "title": "Pointmoon Step Outside",
    "description": "Answer the question \"is it worth stepping outside right now, and why?\" for a place or coordinate. Call this when someone asks whether to go outside, take a walk, or whether now is a good moment to be outdoors, and you want a grounded answer rather than a guess. Returns ONE verdict token — go | caution | no-go — with timing (now/soon/later), a recommended mode (observe-now/short-walk/timed-window), and `because`: the specific grounded claims the verdict stands on, each carrying its source, the time it was observed, its freshness window, and confidence. SILENCE CONTRACT: when the field cannot support an answer — substrate thin, stale, or low-confidence — it returns { silent: true, reason, meta } instead. It never guesses a verdict, and silence is a real answer, not an error: say you do not know. Choose this tool when you want the decision; choose `field_truth` when you want the raw claim array and will do the reasoning yourself. Pointmoon emits tokens, not prose — the verdict is a token and the sentence is yours to write. It reads conditions, not people: whether to interrupt, nudge, or gate anyone is your policy, never this tool.",
    "inputSchema": {
      "$schema": "http://json-schema.org/draft-07/schema#",
      "type": "object",
      "properties": {
        "lat": {
          "description": "Latitude in decimal degrees (WGS84), e.g. 42.36. Provide lat AND lng, OR use `place`. lat/lng win when both are given.",
          "type": "number",
          "minimum": -90,
          "maximum": 90
        },
        "lng": {
          "description": "Longitude in decimal degrees (WGS84), e.g. -71.06. Pair with `lat`.",
          "type": "number",
          "minimum": -180,
          "maximum": 180
        },
        "place": {
          "description": "A place name to geocode, e.g. \"Boston\". Used when you have no coordinates. If it cannot be resolved the tool returns typed silence rather than answering for the wrong place.",
          "type": "string"
        },
        "city": {
          "description": "Optional display-only label. It does NOT geolocate; use `place` or lat/lng.",
          "type": "string"
        },
        "actionMode": {
          "description": "What \"outside\" means for this question: stepping out to look (observe-now, the default), a short walk, or waiting for a timed window. The verdict is judged against the mode you ask about.",
          "type": "string",
          "enum": [
            "observe-now",
            "short-walk",
            "timed-window"
          ]
        },
        "adapterMode": {
          "description": "Data source. \"live\" (default) hits real upstream providers. \"simulated\"/\"fixture\" return deterministic non-real data for testing only — never for a real answer.",
          "type": "string",
          "enum": [
            "live",
            "simulated",
            "fixture"
          ]
        }
      }
    },
    "annotations": {
      "title": "Step Outside",
      "readOnlyHint": true,
      "idempotentHint": true,
      "openWorldHint": true
    }
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

  if (name === 'step_outside') {
    // Same route the hosted tool invokes in-process: the verdict comes from the
    // engine, not from this connector.
    const json = await callHttpGet('/api/step-outside', args)
    const locationLabel =
      typeof args.lat === 'number' && typeof args.lng === 'number'
        ? `${args.lat},${args.lng}`
        : args.place || 'the requested location'
    if (json?.silent === true) {
      return toToolResult(
        json,
        `Pointmoon step_outside: silent for ${locationLabel} — reason "${String(json.reason)}". No verdict guessed.`
      )
    }
    const because = Array.isArray(json?.because) ? json.because.length : 0
    return toToolResult(
      json,
      `Pointmoon step_outside: verdict "${String(json?.verdict)}" (timing ${String(json?.timing)}) for ${locationLabel}, ` +
        `grounded in ${because} sourced claim${because === 1 ? '' : 's'} (each carries source/observedAt/ttlMinutes/confidence).`
    )
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
        version: '0.1.1',
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
