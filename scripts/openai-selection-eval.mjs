import { readFile } from 'node:fs/promises'

const key = process.env.OPENAI_API_KEY
const model = process.env.OPENAI_MODEL

if (!key || !model) {
  console.error('OPENAI_API_KEY and OPENAI_MODEL are required. This eval is intentionally not run in CI.')
  process.exit(2)
}

const corpus = JSON.parse(
  await readFile(new URL('../evals/openai-tool-selection.json', import.meta.url), 'utf8')
)

const only = process.argv.find((arg) => arg.startsWith('--case='))?.slice('--case='.length)
const selectedCases = only
  ? corpus.cases.filter((entry) => entry.id === only)
  : corpus.cases

if (selectedCases.length === 0) {
  console.error(`unknown case: ${only}`)
  process.exit(2)
}

const results = []

for (const testCase of selectedCases) {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      tools: [
        {
          type: 'mcp',
          server_label: corpus.server.label,
          server_description: corpus.server.description,
          server_url: corpus.server.url,
          require_approval: 'never',
        },
      ],
      input: testCase.prompt,
    }),
  })

  const json = await response.json()
  if (!response.ok) {
    results.push({
      id: testCase.id,
      pass: false,
      error: json?.error?.message || JSON.stringify(json),
    })
    continue
  }

  const output = Array.isArray(json.output) ? json.output : []
  const calls = output
    .filter((item) => item?.type === 'mcp_call')
    .map((item) => ({
      name: item.name,
      arguments: item.arguments,
      error: item.error ?? null,
    }))

  const calledNames = calls.map((call) => call.name)
  const expected = testCase.expectedTool

  const pass =
    testCase.kind === 'negative'
      ? calledNames.length === 0
      : calledNames.includes(expected) && calls.every((call) => call.error == null)

  results.push({
    id: testCase.id,
    kind: testCase.kind,
    pass,
    expectedTool: expected,
    calledTools: calledNames,
    calls,
    responseId: json.id ?? null,
  })
}

for (const result of results) {
  const symbol = result.pass ? 'PASS' : 'FAIL'
  console.log(
    `${symbol} ${result.id} expected=${result.expectedTool ?? 'no-call'} called=${(result.calledTools || []).join(',') || 'none'}`
  )
  if (result.error) console.log(`  ${result.error}`)
}

const failed = results.filter((result) => !result.pass)
console.log(JSON.stringify({ model, total: results.length, passed: results.length - failed.length, failed: failed.map((r) => r.id), results }, null, 2))
process.exit(failed.length ? 1 : 0)
