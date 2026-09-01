#!/usr/bin/env node
//
// Runs every example and fails if any of them stops returning claims.
//
//   node examples/run-all.mjs
//
// This is what CI executes. It is a real check, not a formality:
//
//   * each example asserts that `facts.signals[]` is non-empty and that every
//     signal carries a `source`, and throws (exit 1) otherwise;
//   * this runner propagates any non-zero child exit into its own exit code;
//   * it also asserts the hosted tool surface still advertises `field_truth`
//     with a `place` input, so a contract move is caught as well as an outage.
//
// To watch it go red, point it at something that cannot answer:
//
//   POINTMOON_BASE_URL=https://pointmoon.invalid node examples/run-all.mjs
//   echo $?   # 1

import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { listTools, BASE_URL } from './lib/pointmoon.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))

const EXAMPLES = [
  '01-first-call.mjs',
  '02-by-place-name.mjs',
  '03-typed-silence.mjs',
  '04-plain-http.mjs',
]

function run(file) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(here, file)], { stdio: 'inherit' })
    child.on('close', (code) => resolve(code ?? 1))
    child.on('error', () => resolve(1))
  })
}

async function checkToolSurface() {
  const tools = await listTools()
  const fieldTruth = tools.find((t) => t.name === 'field_truth')
  if (!fieldTruth) {
    throw new Error(
      `tools/list at ${BASE_URL}/api/mcp does not advertise \`field_truth\`. ` +
        `Got: ${tools.map((t) => t.name).join(', ') || '(none)'}`
    )
  }
  const props = fieldTruth.inputSchema?.properties ?? {}
  for (const required of ['lat', 'lng', 'place']) {
    if (!props[required]) {
      throw new Error(`field_truth input schema no longer accepts \`${required}\`.`)
    }
  }
  console.log(`tool surface OK — field_truth accepts ${Object.keys(props).join(', ')}\n`)
}

console.log(`Running ${EXAMPLES.length} examples against ${BASE_URL}\n`)

const failures = []

try {
  await checkToolSurface()
} catch (error) {
  console.error(`FAIL  tool surface check: ${error.message}\n`)
  failures.push('tool surface check')
}

for (const file of EXAMPLES) {
  console.log(`${'='.repeat(70)}\n${file}\n${'='.repeat(70)}`)
  const code = await run(file)
  if (code === 0) {
    console.log(`\nPASS  ${file}\n`)
  } else {
    console.log(`\nFAIL  ${file} (exit ${code})\n`)
    failures.push(file)
  }
}

console.log('='.repeat(70))
if (failures.length > 0) {
  console.error(`FAILED: ${failures.length}/${EXAMPLES.length + 1} checks did not return claims:`)
  for (const f of failures) console.error(`  - ${f}`)
  process.exit(1)
}
console.log(`All ${EXAMPLES.length} examples returned sourced claims.`)
