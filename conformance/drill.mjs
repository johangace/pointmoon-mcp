#!/usr/bin/env node
//
// The negative control for the conformance job.
//
//   node conformance/drill.mjs
//
// A green check that cannot go red reports safety it never verified. So before
// anyone is allowed to believe a green `conformance` run, this drill feeds the
// comparator — and then the whole runner — deliberately divergent surfaces and
// fails unless each one comes back RED *naming the exact field that moved*.
//
// "Expected true, got false" is not a pass here. Each case asserts the field
// name appears in the failure output, because a drift report you have to
// decode by hand is a drift report nobody reads.
//
// Entirely offline: a stub connector on stdio and a stub hosted server on
// 127.0.0.1. No npm registry, no Pointmoon, no network.

import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import {
  compareToolSurface,
  compareEnvelopes,
  checkTrustBlocks,
  checkSilenceContract,
  formatReport,
} from './lib/compare.mjs'
import { goodEnvelope, goodTool, goodInputSchema } from './fixtures/envelope.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const rule = (char = '=') => char.repeat(74)

let failures = 0

function check(name, divergences, expectedField, expectedPhrase) {
  const drifts = divergences.filter((d) => d.severity === 'drift')
  const hit = drifts.find((d) => d.field === expectedField)
  const text = formatReport(divergences)

  console.log(`${rule('-')}\n${name}\n${rule('-')}`)
  console.log(text || '  (no findings)')

  if (!hit) {
    console.error(
      `\n  DRILL FAILED: expected a drift on field \`${expectedField}\`, got ` +
        `${drifts.length ? drifts.map((d) => d.field).join(', ') : 'nothing at all'}.`
    )
    failures++
    return
  }
  if (expectedPhrase && !hit.message.includes(expectedPhrase)) {
    console.error(
      `\n  DRILL FAILED: the drift on \`${expectedField}\` did not say "${expectedPhrase}". ` +
        `A generic assertion failure is not a drift report.`
    )
    failures++
    return
  }
  console.log(`\n  OK — named \`${hit.field}\`.\n`)
}

console.log(rule())
console.log('Conformance drill: proving the comparator bites')
console.log(rule() + '\n')

// ---------------------------------------------------------------- comparator
{
  const hosted = [goodTool()]
  const schema = goodInputSchema()
  delete schema.properties.place
  const published = [goodTool({ inputSchema: schema })]
  check(
    'a. the published package lost `place`',
    compareToolSurface(published, hosted),
    'field_truth.inputSchema.properties.place',
    'APPEARED on the hosted server'
  )
}

{
  const hosted = [goodTool()]
  const schema = goodInputSchema()
  schema.properties.zoom = { type: 'number' }
  const published = [goodTool({ inputSchema: schema })]
  check(
    'b. the published package offers a `zoom` the server never had',
    compareToolSurface(published, hosted),
    'field_truth.inputSchema.properties.zoom',
    'DISAPPEARED from the hosted server'
  )
}

{
  const hosted = [goodTool()]
  const schema = goodInputSchema()
  schema.properties.lat = { type: 'string' }
  const published = [goodTool({ inputSchema: schema })]
  check(
    'c. `lat` changed type',
    compareToolSurface(published, hosted),
    'field_truth.inputSchema.properties.lat.type',
    'changed type'
  )
}

{
  const hosted = [goodTool()]
  const schema = goodInputSchema()
  schema.properties.adapterMode = { type: 'string', enum: ['live', 'simulated'] }
  const published = [goodTool({ inputSchema: schema })]
  check(
    'd. the server grew an `adapterMode` enum value the package does not offer',
    compareToolSurface(published, hosted),
    'field_truth.inputSchema.properties.adapterMode.enum',
    'fixture'
  )
}

{
  const hostedSchema = goodInputSchema()
  hostedSchema.required = ['place']
  const hosted = [goodTool({ inputSchema: hostedSchema })]
  const published = [goodTool()]
  check(
    'e. the server made `place` required',
    compareToolSurface(published, hosted),
    'field_truth.inputSchema.required',
    'now REQUIRED by the hosted server'
  )
}

{
  const hosted = [goodTool({ name: 'field_truth' }), goodTool({ name: 'field_truth_v2' })]
  const published = [goodTool()]
  check(
    'f. the server added a tool the package does not implement',
    compareToolSurface(published, hosted),
    'tool:field_truth_v2',
    'ABSENT from the published npm artifact'
  )
}

{
  const published = goodEnvelope()
  const hosted = goodEnvelope()
  hosted.facts.fieldSnapshot.aurora = { source: 'noaa' }
  check(
    'g. the live envelope grew a `fieldSnapshot` axis',
    compareEnvelopes(published, hosted),
    'facts.fieldSnapshot.aurora',
    'APPEARED in the hosted server response'
  )
}

{
  const published = goodEnvelope()
  const hosted = goodEnvelope()
  hosted.schemaVersion = 'field-truth@2.0.0'
  check(
    'h. schemaVersion moved',
    compareEnvelopes(published, hosted),
    'schemaVersion',
    'field-truth@2.0.0'
  )
}

{
  const broken = goodEnvelope()
  delete broken.notices
  check(
    'i. the trust block went missing',
    checkTrustBlocks(broken, 'published npm artifact'),
    'notices.sources',
    'the trust block is missing'
  )
}

{
  const broken = goodEnvelope()
  broken.facts.signals[0].source = undefined
  check(
    'j. a claim arrived without a source',
    checkTrustBlocks(broken, 'published npm artifact'),
    'facts.signals[].source',
    'weather.temperature'
  )
}

{
  const broken = goodEnvelope()
  delete broken.facts.fieldSnapshot.hydro.resolutionReason
  check(
    'k. an axis is silent but will not say why',
    checkSilenceContract(broken, 'published npm artifact'),
    'facts.fieldSnapshot.hydro.resolutionReason',
    'Untyped silence'
  )
}

// ---------------------------------------------------- the whole runner, end to end
//
// The cases above prove the comparator. This proves `conformance/run.mjs`
// itself — the thing CI actually invokes — exits non-zero and prints the field
// name. Without this, someone could weaken the runner while every comparator
// case stayed green.

const hostedStub = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1')
  const body = await new Promise((resolve) => {
    let data = ''
    req.on('data', (c) => (data += c))
    req.on('end', () => resolve(data))
  })

  if (url.pathname === '/api/mcp') {
    const message = JSON.parse(body || '{}')
    const result =
      message.method === 'tools/list'
        ? { tools: [goodTool()] }
        : {
            content: [{ type: 'text', text: 'hosted stub: 1 sourced signal.' }],
            structuredContent: goodEnvelope(),
          }
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    res.end(`event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id: message.id, result })}\n\n`)
    return
  }

  if (url.pathname === '/api/moon') {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify(goodEnvelope()))
    return
  }

  res.writeHead(404).end('{}')
})

await new Promise((resolve) => hostedStub.listen(0, '127.0.0.1', resolve))
const stubUrl = `http://127.0.0.1:${hostedStub.address().port}`

async function runRunner(stubDrift) {
  return new Promise((resolve) => {
    const chunks = []
    const child = spawn(process.execPath, [path.join(here, 'run.mjs')], {
      env: {
        ...process.env,
        POINTMOON_BASE_URL: stubUrl,
        POINTMOON_CONNECTOR_CMD: `${process.execPath} ${path.join(here, 'fixtures', 'stub-connector.mjs')}`,
        STUB_DRIFT: stubDrift,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    child.stdout.on('data', (c) => chunks.push(String(c)))
    child.stderr.on('data', (c) => chunks.push(String(c)))
    child.on('close', (code) => resolve({ code: code ?? 1, output: chunks.join('') }))
    child.on('error', (e) => resolve({ code: 1, output: String(e) }))
  })
}

console.log(`${rule('-')}\nl. end to end: run.mjs against two agreeing stubs (must PASS)\n${rule('-')}`)
{
  const { code, output } = await runRunner('none')
  console.log(output.trim())
  if (code !== 0) {
    console.error(`\n  DRILL FAILED: run.mjs exited ${code} on two identical surfaces. ` +
      `A detector that is red on agreement is noise, not a detector.`)
    failures++
  } else {
    console.log('\n  OK — green when the two sides agree.\n')
  }
}

for (const [stubDrift, needle, label] of [
  ['missing-place', 'place', 'm. end to end: the published connector lost `place` (must FAIL, naming place)'],
  ['missing-trust', 'notices.sources', 'n. end to end: the trust block went missing (must FAIL, naming notices.sources)'],
  ['untyped-silence', 'resolutionReason', 'o. end to end: silence with no reason (must FAIL, naming resolutionReason)'],
]) {
  console.log(`${rule('-')}\n${label}\n${rule('-')}`)
  const { code, output } = await runRunner(stubDrift)
  console.log(output.trim())
  if (code === 0) {
    console.error(`\n  DRILL FAILED: run.mjs exited 0 with drift \`${stubDrift}\` injected.`)
    failures++
  } else if (!output.includes(needle)) {
    console.error(
      `\n  DRILL FAILED: run.mjs went red but never named \`${needle}\`. ` +
        `A generic failure sends a human to diff two JSON blobs by eye.`
    )
    failures++
  } else {
    console.log(`\n  OK — exited ${code} and named \`${needle}\`.\n`)
  }
}

hostedStub.close()

console.log(rule())
if (failures > 0) {
  console.error(`DRILL FAILED: ${failures} case(s) did not go red, or went red without naming the field.`)
  console.error('The conformance job is not actually checking anything. Fix it before trusting green.')
  process.exit(1)
}
console.log('DRILL PASSED: every injected divergence went red and named the exact field that moved.')
console.log('A green conformance run therefore means something.')
