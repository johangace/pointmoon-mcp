#!/usr/bin/env node
//
// Example 4 — the same field-truth with no MCP at all.
//
//   node examples/04-plain-http.mjs
//
// If you are not building on MCP, you do not need it. `field_truth` is a thin
// pin over one HTTP GET. The equivalent curl:
//
//   curl "https://pointmoon.vercel.app/api/moon?audience=facts&surface=open&lat=42.36&lng=-71.06"
//
// `audience=facts` is the prose-free surface: sourced tokens only, no rendered
// sentences. `surface=open` keeps the observation sources redistribution-clean.

import { fieldTruthOverHttp, assertClaims, printSignals, HTTP_URL } from './lib/pointmoon.mjs'

const payload = await fieldTruthOverHttp({ lat: 42.36, lng: -71.06 })

console.log(`GET ${HTTP_URL}?audience=facts&surface=open&lat=42.36&lng=-71.06`)
console.log(`schemaVersion: ${payload.schemaVersion}   audience: ${payload.audience}\n`)

const claims = assertClaims(payload, '04-plain-http')

console.log(`Sourced signals (${claims.length} total, first few):`)
printSignals(claims, 6)

// The one rule for consuming this: the returned readings are the only verified
// facts. Phrase them in your own words; do not add conditions Pointmoon did not
// report.
console.log('\nOK — same envelope as the MCP tool, one GET away.')
