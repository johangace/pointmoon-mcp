#!/usr/bin/env node
//
// Example 3 — typed silence is a normal answer.
//
//   node examples/03-typed-silence.mjs
//
// This calls a point in the middle of the South Atlantic, where several of
// Pointmoon's axes have nothing to stand on: there is no named place, no river
// gauge, no phenology record. Pointmoon does not fill those in with something
// plausible. It marks the axis unresolved, gives a reason, and lowers the
// readiness score — while still returning the axes it *can* ground.
//
// A consumer that treats an unresolved axis as an error has missed the
// contract. Render the unknown as quiet, never as a guess.

import { fieldTruth, assertClaims, silentAxes, BASE_URL } from './lib/pointmoon.mjs'

// Open ocean, roughly halfway between Brazil and South Africa.
const LOCATION = { lat: -40.5, lng: -25.5 }

const { payload, summary } = await fieldTruth(LOCATION)

console.log(`Pointmoon @ ${BASE_URL}`)
console.log(`field_truth({ lat: ${LOCATION.lat}, lng: ${LOCATION.lng} })  // open ocean`)
console.log(`\n${summary}\n`)

const readiness = payload.facts?.meta?.liveReadiness
if (readiness) {
  console.log('Readiness:')
  console.log(`  status: ${readiness.status}   score: ${readiness.score}`)
  for (const [family, provider] of Object.entries(readiness.providers ?? {})) {
    const mark = provider === 'unresolved' ? 'silent  ' : 'grounded'
    console.log(`  ${mark} ${family.padEnd(12)} ${provider}`)
  }
}

const quiet = silentAxes(payload)
console.log(`\nAxes Pointmoon declined to speak on (${quiet.length}):`)
for (const { axis, reason } of quiet) {
  console.log(`  ${axis.padEnd(14)} reason: ${reason}`)
}
if (quiet.length === 0) {
  console.log('  (none this run — the substrate was thicker than usual here)')
}

// Silence on some axes does not mean silence everywhere. Weather still grounds
// over open ocean, so there are still real claims to stand behind.
const claims = assertClaims(payload, '03-typed-silence')
const grounded = new Set(claims.map((s) => s.source))
console.log(`\nStill grounded: ${claims.length} claims from ${grounded.size} sources`)
console.log(`  ${[...grounded].join(', ')}`)

console.log(`\nOK — ${quiet.length} axes silent, ${claims.length} claims still sourced.`)
