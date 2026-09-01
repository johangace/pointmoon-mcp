#!/usr/bin/env node
//
// Example 2 — call by place name instead of coordinates.
//
//   node examples/02-by-place-name.mjs
//   node examples/02-by-place-name.mjs "Yosemite Valley"
//
// `field_truth` takes `place` as well as `lat`/`lng`. Pointmoon geocodes the
// name, grounds the location, and tells you what it resolved to — or returns
// typed silence for the place axis if it cannot resolve the name. It does not
// guess a coordinate.

import { fieldTruth, assertClaims, printSignals, BASE_URL } from './lib/pointmoon.mjs'

const place = process.argv[2] || 'Lisbon'

const { payload, summary } = await fieldTruth({ place })

console.log(`Pointmoon @ ${BASE_URL}`)
console.log(`field_truth({ place: ${JSON.stringify(place)} })`)
console.log(`\n${summary}\n`)

// What the name actually resolved to. `provider` names the geocoder that
// answered; `resolutionStatus` says how confident that resolution is.
const resolved = payload.facts?.fieldSnapshot?.place
if (resolved) {
  console.log('Resolved location:')
  console.log(`  placeName:        ${resolved.placeName}`)
  console.log(`  provider:         ${resolved.provider}`)
  console.log(`  resolutionStatus: ${resolved.resolutionStatus}`)
  console.log(`  habitatType:      ${resolved.habitatType}`)
}

if (resolved?.provider === 'unresolved') {
  // Not a crash. Pointmoon declined to invent a coordinate for this name.
  console.log(`\n  Pointmoon could not geocode ${JSON.stringify(place)}: ${resolved.resolutionReason}`)
  console.log('  That is the contract working — silence, not a plausible guess.')
}

const claims = assertClaims(payload, `02-by-place-name(${place})`)

console.log(`\nSourced signals (${claims.length} total, first few):`)
printSignals(claims)

console.log(`\nProvider map: ${payload.provenance?.providerSummary ?? '(none reported)'}`)
console.log(`\nOK — ${claims.length} sourced claims for ${JSON.stringify(place)}.`)
