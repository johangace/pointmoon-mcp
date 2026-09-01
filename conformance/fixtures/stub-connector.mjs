#!/usr/bin/env node
//
// A stand-in for the published connector, used ONLY by the offline drill.
// It speaks the same stdio JSON-RPC the real package speaks, so
// `conformance/run.mjs` cannot tell it apart from `npx -y pointmoon-mcp`.
//
// STUB_DRIFT selects the divergence to inject:
//   none              identical to the hosted stub — the drill's control
//   missing-place     the connector no longer offers `place`
//   extra-property    the connector offers a `zoom` the server never had
//   wrong-type        `lat` became a string
//   missing-trust     the envelope comes back without `notices`
//   untyped-silence   an unresolved axis with no reason

import readline from 'node:readline'
import { goodEnvelope, goodTool, goodInputSchema } from './envelope.mjs'

const drift = process.env.STUB_DRIFT || 'none'

function tool() {
  const schema = goodInputSchema()
  if (drift === 'missing-place') delete schema.properties.place
  if (drift === 'extra-property') schema.properties.zoom = { type: 'number' }
  if (drift === 'wrong-type') schema.properties.lat = { type: 'string' }
  return goodTool({ inputSchema: schema })
}

function envelope() {
  const payload = goodEnvelope()
  if (drift === 'missing-trust') delete payload.notices
  if (drift === 'untyped-silence') {
    delete payload.facts.fieldSnapshot.hydro.resolutionReason
  }
  return payload
}

function write(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`)
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity })

for await (const line of rl) {
  if (!line.trim()) continue
  const message = JSON.parse(line)
  if (!('id' in message)) continue

  if (message.method === 'tools/list') {
    write({ jsonrpc: '2.0', id: message.id, result: { tools: [tool()] } })
    continue
  }
  if (message.method === 'tools/call') {
    write({
      jsonrpc: '2.0',
      id: message.id,
      result: {
        content: [{ type: 'text', text: 'stub connector: 1 sourced signal.' }],
        structuredContent: envelope(),
      },
    })
    continue
  }
  write({ jsonrpc: '2.0', id: message.id, result: {} })
}
