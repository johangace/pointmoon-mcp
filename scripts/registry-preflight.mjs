#!/usr/bin/env node
// Preflight for listing Pointmoon on the official MCP Registry.
// (johangace/pointmoon#67)
//
//   npm run registry:preflight
//
// This script VALIDATES AND REPORTS. It never publishes, never authenticates,
// never reads a credential, and never writes to the registry. `mcp-publisher`
// is invoked in `validate` mode only — the one subcommand that talks to the
// registry read-only. The actual publish is a founder action; see REGISTRY.md.
//
// It answers three questions a founder needs answered before spending a
// credential:
//
//   1. Does `server.json` validate against the CURRENT official server schema?
//      Not hand-checked — the registry's own `mcp-publisher validate` does it,
//      against the live schema named by the file's own `$schema` field.
//   2. Is the thing we are about to advertise actually there? A registry entry
//      pointing at a dead endpoint or a package that fails ownership
//      verification is worse than no entry.
//   3. Which credential does the real publish need, in what order?
//
// Exit codes: 1 if a FAIL is found (something we can and must fix here);
// 0 if the payload is publishable, even when GATEs remain — a gate is a
// founder-only step by design, so it must not read as a broken build.

import { readFileSync, existsSync, mkdirSync, chmodSync } from 'node:fs'
import { execFileSync, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SERVER_JSON = join(ROOT, 'server.json')
const PACKAGE_JSON = join(ROOT, 'package.json')

const results = []
const record = (level, label, detail) => {
  results.push({ level, label, detail })
  const mark = { PASS: '  ok  ', FAIL: ' FAIL ', GATE: ' GATE ', INFO: '  --  ' }[level]
  console.log(`[${mark}] ${label}`)
  for (const line of String(detail).split('\n')) console.log(`         ${line}`)
}

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'))

// --- 1. the registry's own validator, against the live schema ---------------

/**
 * Find `mcp-publisher`. Order: an explicit path, then PATH, then a download of
 * the official release into the OS temp dir (never into the repo).
 * The download is the same one-liner the official quickstart publishes.
 */
function findPublisher() {
  const explicit = process.env.MCP_PUBLISHER
  if (explicit) {
    if (!existsSync(explicit)) throw new Error(`MCP_PUBLISHER=${explicit} does not exist`)
    return { bin: explicit, origin: 'MCP_PUBLISHER' }
  }

  const onPath = spawnSync('mcp-publisher', ['--version'], { encoding: 'utf8' })
  if (!onPath.error) return { bin: 'mcp-publisher', origin: 'PATH' }

  if (process.argv.includes('--no-download')) {
    throw new Error(
      'mcp-publisher is not installed and --no-download was passed.\n' +
        'Install it (brew install mcp-publisher) or drop --no-download.'
    )
  }

  const plat = process.platform === 'darwin' ? 'darwin' : 'linux'
  const arch = process.arch === 'arm64' ? 'arm64' : 'amd64'
  const dir = join(tmpdir(), 'pointmoon-mcp-publisher')
  const bin = join(dir, 'mcp-publisher')
  if (existsSync(bin)) return { bin, origin: `cached in ${dir}` }

  mkdirSync(dir, { recursive: true })
  const url =
    'https://github.com/modelcontextprotocol/registry/releases/latest/download/' +
    `mcp-publisher_${plat}_${arch}.tar.gz`
  console.log(`         fetching ${url}`)
  execFileSync('sh', ['-c', `curl -sSL "${url}" | tar xz -C "${dir}" mcp-publisher`], {
    stdio: ['ignore', 'ignore', 'inherit'],
  })
  chmodSync(bin, 0o755)
  return { bin, origin: 'downloaded (official release)' }
}

function schemaValidate(server) {
  let publisher
  try {
    publisher = findPublisher()
  } catch (error) {
    record('FAIL', 'mcp-publisher unavailable', error.message)
    return
  }

  const version = spawnSync(publisher.bin, ['--version'], { encoding: 'utf8' })
  const versionLine = `${version.stdout || ''}${version.stderr || ''}`.trim()
  record('INFO', 'validator', `${versionLine}\nresolved from: ${publisher.origin}`)

  // `validate` is read-only: it checks the payload and exits. It cannot
  // publish, and it is not authenticated.
  const run = spawnSync(publisher.bin, ['validate'], { cwd: ROOT, encoding: 'utf8' })
  const output = `${run.stdout || ''}${run.stderr || ''}`.trim()
  if (run.status === 0) {
    record('PASS', 'server.json validates', `${output}\nschema: ${server.$schema}`)
  } else {
    record('FAIL', 'server.json does not validate', output || `exit ${run.status}`)
  }
}

async function schemaReachable(server) {
  const url = server.$schema
  if (!url) return record('FAIL', '$schema missing', 'server.json declares no $schema URL.')
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) })
    if (!res.ok) return record('FAIL', '$schema unreachable', `${url} returned HTTP ${res.status}`)
    const schema = await res.json()
    if (schema.$id !== url) {
      return record('FAIL', '$schema mismatch', `Declared ${url}, served $id ${schema.$id}`)
    }
    record('PASS', 'schema is the live official one', `${url}\n$id matches; served 200`)
  } catch (error) {
    record('FAIL', '$schema unreachable', `${url}: ${error?.message || error}`)
  }
}

// --- 2. is the thing we are advertising actually there? --------------------

function parseMcpBody(body) {
  const trimmed = body.trim()
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return JSON.parse(trimmed)
  for (const line of trimmed.split(/\r?\n/)) {
    if (!line.startsWith('data:')) continue
    const raw = line.slice(5).trim()
    if (!raw || raw === '[DONE]') continue
    try {
      return JSON.parse(raw)
    } catch {
      // keep-alive or comment frame
    }
  }
  throw new Error(`no JSON-RPC frame in response: ${body.slice(0, 200)}`)
}

/**
 * The registry requires a remote server to be publicly accessible at its URL.
 * We check the endpoint named in server.json itself — deliberately NOT the
 * POINTMOON_BASE_URL override the examples honour, because what is being
 * listed is this literal URL.
 */
async function remoteLive(server) {
  for (const remote of server.remotes ?? []) {
    if (remote.url.includes('{')) {
      record('INFO', `remote ${remote.url}`, 'URL template — not probed.')
      continue
    }
    try {
      const res = await fetch(remote.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
        signal: AbortSignal.timeout(45000),
      })
      const body = await res.text()
      if (!res.ok) {
        record('FAIL', `remote ${remote.url}`, `HTTP ${res.status}`)
        continue
      }
      const tools = parseMcpBody(body).result?.tools ?? []
      const names = tools.map((t) => t.name)
      if (!names.includes('field_truth')) {
        record('FAIL', `remote ${remote.url}`, `answered, but tools/list has no field_truth: ${names.join(', ') || '(none)'}`)
        continue
      }
      const props = Object.keys(tools.find((t) => t.name === 'field_truth').inputSchema?.properties ?? {})
      record(
        'PASS',
        `remote ${remote.url}`,
        `${remote.type}; tools/list -> ${names.join(', ')}\nfield_truth inputs: ${props.join(', ')}`
      )
    } catch (error) {
      record('FAIL', `remote ${remote.url}`, error?.message || String(error))
    }
  }
}

/**
 * The npm half. Two separate things have to be true, and only one of them is
 * in this repository's gift:
 *   - this tree's package.json carries `mcpName` (we control that);
 *   - the ARTIFACT ON NPM carries it too (only a publish puts it there).
 * The registry reads the published artifact, so the second one is what
 * actually decides whether the npm entry validates.
 */
async function npmOwnership(server, pkg) {
  const entry = (server.packages ?? []).find((p) => p.registryType === 'npm')
  if (!entry) return record('INFO', 'npm package', 'server.json declares no npm package.')

  if (pkg.mcpName !== server.name) {
    record(
      'FAIL',
      'package.json mcpName',
      `package.json mcpName is ${JSON.stringify(pkg.mcpName)}; server.json name is ${JSON.stringify(server.name)}. They must match.`
    )
  } else {
    record('PASS', 'package.json mcpName', `${pkg.mcpName} matches server.json name`)
  }

  // REGISTRY.md step 3 tells the founder to set BOTH version fields in server.json
  // to the version actually published, and says this preflight fails if either
  // drifts. Check both, or that sentence is not true.
  const drifted = [
    entry.version !== pkg.version && `server.json packages[].version is ${entry.version}`,
    server.version !== pkg.version && `server.json version is ${server.version}`,
  ].filter(Boolean)

  if (drifted.length > 0) {
    record(
      'FAIL',
      'npm version drift',
      `${drifted.join('; ')}; package.json version is ${pkg.version}.\n` +
        'REGISTRY.md step 3: both server.json version fields must be the version actually published.'
    )
  } else {
    record(
      'PASS',
      'npm version in step',
      `server.json version and packages[].version and package.json all say ${pkg.version}`
    )
  }

  try {
    const res = await fetch(`https://registry.npmjs.org/${entry.identifier}`, {
      signal: AbortSignal.timeout(30000),
    })
    if (!res.ok) {
      return record('FAIL', 'npm registry', `registry.npmjs.org returned HTTP ${res.status}`)
    }
    const meta = await res.json()
    const published = meta.versions?.[entry.version]
    if (!published) {
      return record(
        'GATE',
        'npm artifact not published',
        `${entry.identifier}@${entry.version} is not on npm (published: ${Object.keys(meta.versions ?? {}).join(', ') || 'none'}).\n` +
          'The registry reads the published artifact, so the npm entry cannot verify until it exists.'
      )
    }
    if (published.mcpName !== server.name) {
      return record(
        'GATE',
        'npm artifact carries no ownership marker',
        `Published ${entry.identifier}@${entry.version} has mcpName=${JSON.stringify(published.mcpName ?? null)}, ` +
          `expected ${JSON.stringify(server.name)}.\n` +
          'The registry verifies npm ownership by reading `mcpName` out of the PUBLISHED package.json.\n' +
          'This tree has it; the artifact on npm predates it. Closing this needs a republish,\n' +
          'which is behind the credential gate in REGISTRY.md — not something this script can do.'
      )
    }
    record('PASS', 'npm ownership marker', `published ${entry.identifier}@${entry.version} carries mcpName=${published.mcpName}`)
  } catch (error) {
    record('FAIL', 'npm registry', error?.message || String(error))
  }
}

// --- 3. which credential, in what order ------------------------------------

function namespaceCredential(server) {
  const namespace = server.name.split('/')[0]
  if (namespace.startsWith('io.github.')) {
    const account = namespace.slice('io.github.'.length)
    record(
      'GATE',
      'registry namespace is unauthenticated here',
      `Namespace ${namespace}/* is a GitHub namespace.\n` +
        `Publishing needs a GitHub OAuth DEVICE FLOW as "${account}": \`mcp-publisher login github\`,\n` +
        'which prints a code to enter at https://github.com/login/device.\n' +
        'It is interactive by construction — a human at a browser, not a token in CI.\n' +
        'No credential is read, stored or required by this script.'
    )
  } else {
    record(
      'GATE',
      'registry namespace is unauthenticated here',
      `Namespace ${namespace}/* is not a GitHub namespace; it needs DNS or HTTP proof of the domain.\n` +
        'See https://github.com/modelcontextprotocol/registry/blob/main/docs/modelcontextprotocol-io/authentication.mdx'
    )
  }
}

async function alreadyListed(server) {
  const url = `https://registry.modelcontextprotocol.io/v0/servers?search=${encodeURIComponent(server.name)}`
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30000) })
    const body = await res.json()
    const count = body?.metadata?.count ?? (body?.servers ?? []).length
    record(
      'INFO',
      'current registry state',
      `${url}\n-> ${JSON.stringify(body).slice(0, 300)}\n${
        count > 0 ? 'Already listed. A publish would be an update.' : 'Not listed. A publish would be the first entry.'
      }`
    )
  } catch (error) {
    record('INFO', 'current registry state', `could not reach ${url}: ${error?.message || error}`)
  }
}

// --- run -------------------------------------------------------------------

const server = readJson(SERVER_JSON)
const pkg = readJson(PACKAGE_JSON)

console.log(`Registry preflight for ${server.name} v${server.version}`)
console.log('This validates and reports. It does not publish.\n')

schemaValidate(server)
await schemaReachable(server)
await remoteLive(server)
await npmOwnership(server, pkg)
namespaceCredential(server)
await alreadyListed(server)

const fails = results.filter((r) => r.level === 'FAIL')
const gates = results.filter((r) => r.level === 'GATE')

console.log('\n' + '-'.repeat(72))
if (fails.length > 0) {
  console.log(`NOT PUBLISHABLE: ${fails.length} failure(s) to fix in this repository:`)
  for (const f of fails) console.log(`  - ${f.label}`)
  process.exit(1)
}

console.log('PAYLOAD IS PUBLISHABLE: server.json validates against the live official schema,')
console.log('and the remote endpoint it advertises is answering.')
console.log(`\n${gates.length} founder-only gate(s) remain before the real publish:`)
for (const g of gates) console.log(`  - ${g.label}`)
console.log(`
The credential sequence, in order (REGISTRY.md has the full note):

  1. npm publish credential — rotate first. Publishing pointmoon-mcp is gated on a
     credential rotation that has not happened yet; that rotation is tracked
     privately, not in this public repository. Nothing below may happen first.
  2. npm — republish pointmoon-mcp with the rotated credential so the artifact
     carries mcpName "${server.name}". The registry reads that
     field out of the PUBLISHED package to verify npm ownership. Follow
     RELEASING.md; then set both \`version\` fields in server.json to the version
     actually published.
  3. MCP Registry — \`mcp-publisher login github\` as the account owning
     \`${server.name.split('/')[0]}/*\`. GitHub OAuth device flow, interactive.
  4. \`mcp-publisher publish\` — founder action. Not automated, not in CI, not here.

Nothing in this repository holds any of those credentials, and nothing here can
run step 2, 3 or 4.`)
