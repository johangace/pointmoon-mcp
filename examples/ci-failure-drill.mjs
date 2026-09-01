#!/usr/bin/env node
//
// Proves the examples check can actually fail.
//
//   node examples/ci-failure-drill.mjs
//
// A green CI job that cannot go red is worse than no CI job: it reports safety
// it never checked. So this drill is itself part of the build. It stands up a
// local stub that answers every Pointmoon request with a *well-formed but
// claim-less* envelope — HTTP 200, valid JSON, correct keys, `facts.signals`
// empty — points `run-all.mjs` at it, and fails if the runner does NOT exit
// non-zero.
//
// In other words: if someone ever weakens the assertions in the examples so
// that "no claims" passes, this drill goes red and the build stops.

import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))

// A response the naive check would wave through: right shape, zero claims.
const EMPTY_ENVELOPE = {
  schemaVersion: 'field-truth@1.1.0',
  audience: 'facts',
  facts: { signals: [], fieldSnapshot: {}, timingWindows: [], meta: {} },
  notices: { sources: [] },
  provenance: {},
}

// The stub still advertises a correct tool surface, so the ONLY thing that can
// fail the runner is the empty-claims assertion inside the examples.
const TOOL_LIST = {
  tools: [
    {
      name: 'field_truth',
      inputSchema: {
        type: 'object',
        properties: { lat: {}, lng: {}, place: {}, city: {} },
      },
    },
  ],
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = ''
    req.on('data', (chunk) => (data += chunk))
    req.on('end', () => resolve(data))
  })
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1')

  if (url.pathname === '/api/mcp') {
    const message = JSON.parse((await readBody(req)) || '{}')
    const result =
      message.method === 'tools/list'
        ? TOOL_LIST
        : {
            content: [{ type: 'text', text: 'stub: substrate thin — silence rather than a guess.' }],
            structuredContent: EMPTY_ENVELOPE,
          }
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    res.end(`event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id: message.id, result })}\n\n`)
    return
  }

  if (url.pathname === '/api/moon') {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify(EMPTY_ENVELOPE))
    return
  }

  res.writeHead(404).end('{}')
})

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const { port } = server.address()
const stubUrl = `http://127.0.0.1:${port}`

console.log(`Failure drill: pointing examples at a claim-less stub at ${stubUrl}`)
console.log('Expecting run-all.mjs to EXIT NON-ZERO.\n')

const exitCode = await new Promise((resolve) => {
  const child = spawn(process.execPath, [path.join(here, 'run-all.mjs')], {
    env: { ...process.env, POINTMOON_BASE_URL: stubUrl },
    stdio: 'inherit',
  })
  child.on('close', (code) => resolve(code ?? 1))
  child.on('error', () => resolve(1))
})

server.close()

console.log(`\n${'='.repeat(70)}`)
if (exitCode === 0) {
  console.error('DRILL FAILED: run-all.mjs exited 0 against a stub that returned zero claims.')
  console.error('The examples check is not actually checking anything. Fix the assertions.')
  process.exit(1)
}
console.log(`DRILL PASSED: run-all.mjs exited ${exitCode} against zero claims, as it must.`)
console.log('The examples check can go red, so a green run means something.')
