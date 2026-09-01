#!/usr/bin/env node
//
// Does the package a stranger installs still speak the contract we serve?
//
//   node conformance/run.mjs
//
// `pointmoon-mcp@0.1.0` was published on 2026-06-17 and has never been
// republished, while the engine behind the hosted server kept moving. Nothing
// has ever asserted that the two agree. This does.
//
// What it compares:
//
//   PUBLISHED SIDE  `npx -y pointmoon-mcp@latest` — the real artifact, pulled
//                   from the npm registry, driven over stdio like an MCP
//                   client. NOT bin/pointmoon-mcp.mjs in this tree; the tree
//                   is not what strangers have.
//   HOSTED SIDE     https://pointmoon.vercel.app/api/mcp — `tools/list` and
//                   one live `tools/call`.
//
// Why `tools/list` and not `/.well-known/mcp/server-card.json`: the card is a
// static advertisement and is currently stale (it omits `place` — filed as
// johangace/pointmoon#76). `tools/list` is the surface a client actually
// negotiates against, so it is the truth this job compares to. Comparing to
// the card would make this job red on arrival for something that is not the
// connector's fault.
//
// It fails, naming the field, when:
//   * the tool name moves;
//   * any input-schema property appears on one side and not the other;
//   * a shared property changes `type` or `enum`, or `required` changes;
//   * the live envelope's shape moves (top-level keys, `facts` keys,
//     `fieldSnapshot` axes, `schemaVersion`);
//   * the trust block is missing (notices/provenance/per-signal sourcing/the
//     freshness quadruple) or the silence contract is untyped.
//
// It does NOT compare live values between the two calls. Two calls seconds
// apart legitimately differ — a source that timed out on one resolves on the
// next — and a flaky red gets ignored, which fails the same way a check that
// cannot go red fails.
//
// To watch it go red for real, see `conformance/drill.mjs`.

import { listTools, fieldTruth, BASE_URL, silentAxes, assertClaims } from '../examples/lib/pointmoon.mjs'
import { withConnector, connectorCommand, publishedPackageInfo } from './lib/connector.mjs'
import {
  compareToolSurface,
  compareEnvelopes,
  checkTrustBlocks,
  checkSilenceContract,
  formatReport,
  PUBLISHED,
  HOSTED,
} from './lib/compare.mjs'

// One fixed, well-covered coordinate so both sides ask the same question.
// Boston, MA — the same point the README's first example uses.
const PROBE = { lat: 42.36, lng: -71.06 }

const rule = (char = '=') => char.repeat(74)

async function describePublished() {
  if (process.env.POINTMOON_CONNECTOR_CMD) {
    return { version: '(stub)', note: `POINTMOON_CONNECTOR_CMD=${process.env.POINTMOON_CONNECTOR_CMD}` }
  }
  try {
    return await publishedPackageInfo()
  } catch (error) {
    return { version: '(registry unreachable)', note: error.message }
  }
}

console.log(rule())
console.log('Pointmoon connector conformance')
console.log(rule())

const pkg = await describePublished()
console.log(`${PUBLISHED}:  ${connectorCommand()}`)
if (pkg.version) console.log(`  resolved version   ${pkg.version}`)
if (pkg.publishedAt) {
  console.log(`  published          ${pkg.publishedAt}  (${pkg.daysSincePublish} days ago)`)
}
if (pkg.shasum) console.log(`  dist.shasum        ${pkg.shasum}`)
if (pkg.note) console.log(`  ${pkg.note}`)
console.log(`${HOSTED}:              ${BASE_URL}/api/mcp`)
console.log(`probe:                      lat=${PROBE.lat} lng=${PROBE.lng}\n`)

const divergences = []

// ---------------------------------------------------------------- tool surface
console.log(`${rule('-')}\n1. tool surface (tools/list, both sides)\n${rule('-')}`)

const { publishedTools, publishedEnvelope, publishedSummary } = await withConnector(async (rpc) => {
  const list = await rpc('tools/list')
  const call = await rpc('tools/call', { name: 'field_truth', arguments: PROBE })
  return {
    publishedTools: list?.tools ?? [],
    publishedEnvelope: call?.structuredContent,
    publishedSummary: call?.content?.[0]?.text ?? '',
  }
})

const hostedTools = await listTools()

const nameList = (tools) => tools.map((t) => t.name).join(', ') || '(none)'
console.log(`  ${PUBLISHED}: ${nameList(publishedTools)}`)
console.log(`  ${HOSTED}:      ${nameList(hostedTools)}`)

const publishedProps = Object.keys(
  publishedTools.find((t) => t.name === 'field_truth')?.inputSchema?.properties ?? {}
)
const hostedProps = Object.keys(
  hostedTools.find((t) => t.name === 'field_truth')?.inputSchema?.properties ?? {}
)
console.log(`  field_truth inputs — ${PUBLISHED} (${publishedProps.length}): ${publishedProps.join(', ')}`)
console.log(`  field_truth inputs — ${HOSTED} (${hostedProps.length}): ${hostedProps.join(', ')}\n`)

divergences.push(...compareToolSurface(publishedTools, hostedTools))

// ------------------------------------------------------------- live field_truth
console.log(`${rule('-')}\n2. one live field_truth, through each side\n${rule('-')}`)

if (!publishedEnvelope) {
  divergences.push({
    severity: 'drift',
    field: 'tools/call:field_truth',
    message:
      `${PUBLISHED}: field_truth returned no \`structuredContent\`. Text was: ` +
      `${publishedSummary || '(none)'}`,
  })
}

const { payload: hostedEnvelope, summary: hostedSummary } = await fieldTruth(PROBE)

console.log(`  ${PUBLISHED}: ${publishedSummary || '(no summary)'}`)
console.log(`  ${HOSTED}:      ${hostedSummary || '(no summary)'}`)

if (publishedEnvelope) {
  // Reuse the assertion the examples already run: claims exist and are sourced.
  assertClaims(publishedEnvelope, `${PUBLISHED} field_truth`)
  assertClaims(hostedEnvelope, `${HOSTED} field_truth`)

  console.log(`  schemaVersion — ${PUBLISHED}: ${publishedEnvelope.schemaVersion}`)
  console.log(`  schemaVersion — ${HOSTED}:      ${hostedEnvelope.schemaVersion}`)

  divergences.push(...compareEnvelopes(publishedEnvelope, hostedEnvelope))
}

// ------------------------------------------------------------ trust and silence
console.log(`\n${rule('-')}\n3. trust block and silence contract\n${rule('-')}`)

for (const [side, envelope] of [
  [PUBLISHED, publishedEnvelope],
  [HOSTED, hostedEnvelope],
]) {
  if (!envelope) continue
  divergences.push(...checkTrustBlocks(envelope, side))
  divergences.push(...checkSilenceContract(envelope, side))

  const quiet = silentAxes(envelope)
  const sourceCount = envelope?.notices?.sources?.length ?? 0
  const providers = Object.keys(envelope?.provenance?.providers ?? {})
  console.log(
    `  ${side}: ${envelope.facts?.signals?.length ?? 0} sourced signals, ` +
      `${sourceCount} licensing notices, providers [${providers.join(', ')}]`
  )
  console.log(
    `  ${side}: ${quiet.length} axis/axes in typed silence` +
      (quiet.length ? ` — ${quiet.map((q) => `${q.axis} (${q.reason})`).join(', ')}` : '')
  )
}

// ------------------------------------------------------------------- the verdict
const drifts = divergences.filter((d) => d.severity === 'drift')
const notes = divergences.filter((d) => d.severity === 'note')

console.log(`\n${rule()}`)
if (divergences.length > 0) {
  console.log('Findings:\n')
  console.log(formatReport(divergences))
  console.log('')
}

if (drifts.length > 0) {
  console.error(
    `CONFORMANCE FAILED: ${drifts.length} field(s) diverged between the ${PUBLISHED} ` +
      `(${pkg.version}) and the ${HOSTED}.`
  )
  console.error('Fields that moved:')
  for (const d of drifts) console.error(`  - ${d.field}`)
  console.error('\nSee RELEASING.md — republishing the connector is a founder action.')
  process.exit(1)
}

console.log(
  `CONFORMANCE PASSED: the ${PUBLISHED} (${pkg.version}) and the ${HOSTED} agree on the ` +
    `field_truth tool name, all ${hostedProps.length} input-schema properties, the live envelope ` +
    `shape, the trust block and the silence contract.`
)
if (notes.length > 0) {
  console.log(`${notes.length} note(s) above are informational and do not fail the build.`)
}
