// Drives the PUBLISHED connector — the artifact a stranger actually installs —
// over stdio, exactly the way an MCP client would.
//
// It runs `npx -y pointmoon-mcp@latest` by default: the package from the npm
// registry, NOT `bin/pointmoon-mcp.mjs` in this working tree. Testing the
// working tree would prove nothing about what strangers have; the whole point
// of johangace/pointmoon#72 is that the two can silently diverge.
//
// Override with POINTMOON_CONNECTOR_CMD (a shell-style argv string) so the
// offline failure drill can substitute a stub.

import { spawn } from 'node:child_process'
import readline from 'node:readline'

export const DEFAULT_CONNECTOR_CMD = 'npx -y pointmoon-mcp@latest'

export function connectorCommand() {
  return process.env.POINTMOON_CONNECTOR_CMD || DEFAULT_CONNECTOR_CMD
}

/** Fetch the registry metadata for the published package. */
export async function publishedPackageInfo(name = 'pointmoon-mcp', { timeoutMs = 30000 } = {}) {
  const res = await fetch(`https://registry.npmjs.org/${name}`, {
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!res.ok) throw new Error(`registry.npmjs.org returned HTTP ${res.status} for ${name}`)
  const doc = await res.json()
  const version = doc['dist-tags']?.latest
  const publishedAt = doc.time?.[version]
  const dist = doc.versions?.[version]?.dist ?? {}
  return {
    name,
    version,
    publishedAt,
    daysSincePublish: publishedAt
      ? Math.floor((Date.now() - Date.parse(publishedAt)) / 86400000)
      : null,
    tarball: dist.tarball,
    shasum: dist.shasum,
    integrity: dist.integrity,
  }
}

/**
 * Start the connector, run `fn(rpc)` against it, and shut it down.
 * `rpc(method, params)` resolves with the JSON-RPC `result`.
 */
export async function withConnector(fn, { timeoutMs = 120000, env = {} } = {}) {
  const argv = connectorCommand().split(/\s+/).filter(Boolean)
  const child = spawn(argv[0], argv.slice(1), {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, ...env },
  })

  const stderr = []
  child.stderr.on('data', (chunk) => stderr.push(String(chunk)))

  const pending = new Map()
  let nextId = 1
  let exited = null

  child.on('close', (code) => {
    exited = code ?? 1
    for (const { reject } of pending.values()) {
      reject(
        new Error(
          `The connector (\`${connectorCommand()}\`) exited with code ${exited} before answering.\n` +
            `stderr:\n${stderr.join('').slice(0, 2000) || '(empty)'}`
        )
      )
    }
    pending.clear()
  })
  child.on('error', (error) => {
    exited = 1
    for (const { reject } of pending.values()) {
      reject(new Error(`Could not start \`${connectorCommand()}\`: ${error?.message || error}`))
    }
    pending.clear()
  })

  const rl = readline.createInterface({ input: child.stdout, crlfDelay: Infinity })
  rl.on('line', (line) => {
    const trimmed = line.trim()
    if (!trimmed.startsWith('{')) return // npx chatter, not a JSON-RPC frame
    let message
    try {
      message = JSON.parse(trimmed)
    } catch {
      return
    }
    const waiter = pending.get(message.id)
    if (!waiter) return
    pending.delete(message.id)
    if (message.error) {
      waiter.reject(new Error(`connector JSON-RPC error ${message.error.code}: ${message.error.message}`))
    } else {
      waiter.resolve(message.result)
    }
  })

  const rpc = (method, params) =>
    new Promise((resolve, reject) => {
      if (exited !== null) {
        reject(new Error(`The connector already exited (code ${exited}).`))
        return
      }
      const id = nextId++
      const timer = setTimeout(() => {
        pending.delete(id)
        reject(
          new Error(
            `The connector did not answer \`${method}\` within ${timeoutMs}ms.\n` +
              `stderr:\n${stderr.join('').slice(0, 2000) || '(empty)'}`
          )
        )
      }, timeoutMs)
      pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer)
          resolve(value)
        },
        reject: (error) => {
          clearTimeout(timer)
          reject(error)
        },
      })
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`)
    })

  try {
    return await fn(rpc)
  } finally {
    rl.close()
    child.stdin.end()
    child.kill()
  }
}
