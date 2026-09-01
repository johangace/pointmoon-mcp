#!/usr/bin/env node
//
// Example 1 — your first field-truth call.
//
//   node examples/01-first-call.mjs
//
// No install, no key, no account, no local server. Only Node 18+.
// It asks the hosted Pointmoon MCP server for current conditions at a
// coordinate and prints the sourced tokens it gets back.

import { fieldTruth, assertClaims, printSignals, weatherReading, BASE_URL } from './lib/pointmoon.mjs'

// Boston Common, in decimal degrees (WGS84).
const LOCATION = { lat: 42.36, lng: -71.06 }

const { payload, summary } = await fieldTruth(LOCATION)

console.log(`Pointmoon @ ${BASE_URL}`)
console.log(`schemaVersion: ${payload.schemaVersion}`)
console.log(`\n${summary}\n`)

const claims = assertClaims(payload, '01-first-call')

console.log(`Sourced signals (${claims.length} total, first few):`)
printSignals(claims)

// Signals are lean. The freshness envelope — when it was observed, and how long
// the producer says it stays current — lives on the matching fieldSnapshot
// reading. Read `ttlMinutes` there rather than assuming a global freshness.
const weather = weatherReading(payload)
if (weather) {
  console.log('\nFreshness envelope for the weather reading:')
  console.log(`  source:      ${weather.source}`)
  console.log(`  observedAt:  ${weather.observedAt}`)
  console.log(`  ttlMinutes:  ${weather.ttlMinutes}   <- producer-declared freshness window`)
  console.log(`  temperature: ${weather.temperatureC}°C`)
}

// Every source that contributed carries its own attribution terms. If you
// display or redistribute Pointmoon data, you are responsible for honouring them.
const sources = (payload.notices?.sources ?? []).map((s) => s.source)
if (sources.length > 0) {
  console.log(`\nAttribution required for: ${sources.join(', ')}`)
}

console.log(`\nOK — ${claims.length} sourced claims.`)
