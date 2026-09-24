# Listing `pointmoon` on the official MCP Registry

**Publishing to the registry is a founder action.** This repository contains the
validated payload and preflight tooling, but no registry credential and no CI publish
job. That boundary is deliberate.

There is **no npm credential-rotation gate**. The npm prerequisite is simply that the
current connector release be published by the founder using valid npm publish access.

---

## Where we are

Pointmoon is not yet verified as live in the official MCP Registry.

The hosted server is already public and callable at:

```
https://pointmoon.ai/api/mcp
```

The registry work is about **discovery**, not creating another backend.

## What is in the repository

| file | what it is |
| --- | --- |
| [`server.json`](./server.json) | Registry payload for the hosted remote and npm package. |
| [`scripts/registry-preflight.mjs`](./scripts/registry-preflight.mjs) | Validates/report only; never publishes. |
| `mcpName` in [`package.json`](./package.json) | npm ownership marker the registry can verify once the current package is published. |

## Preflight

```bash
npm run registry:preflight
```

The preflight checks the current registry schema, public MCP endpoint, version alignment,
published npm ownership marker and existing registry state. It is read-only and does not
authenticate or publish.

## Founder actions still required

### 1. Publish the current npm connector

The currently published `pointmoon-mcp@0.1.0` predates the current `mcpName` metadata
and is also behind the hosted public tool surface.

Publish the prepared current package following [`RELEASING.md`](./RELEASING.md), using
valid founder-controlled npm publish access.

No token rotation is required by Pointmoon policy.

After publication, verify that the published package carries the expected `mcpName` and
that connector conformance is green.

### 2. Authenticate the GitHub namespace interactively

`server.json` claims the name `io.github.johangace/pointmoon`. The official registry
requires the namespace owner to authenticate with GitHub.

Typical flow:

```console
mcp-publisher login github
mcp-publisher publish
```

This interactive identity step remains a human/founder gate. Do not move namespace
credentials into the repository merely to automate a rare publication.

## Publication order

1. Finish and verify the current connector release candidate.
2. Publish `pointmoon-mcp` to npm using valid founder-controlled publish access.
3. Re-run connector conformance against the newly published artifact; require the public
   package to match the hosted contract.
4. Ensure `server.json` and `package.json` carry the actual published version.
5. Run:
   ```bash
   npm run registry:preflight
   ```
6. Authenticate the GitHub namespace:
   ```bash
   mcp-publisher login github
   ```
7. Publish:
   ```bash
   mcp-publisher publish
   ```
8. Verify Pointmoon appears in the registry search/API.
9. Only after verification, replace the README's "not listed yet" wording with the real
   registry entry.

## Deliberate boundaries

- **No CI publish job** for npm or the Registry. Publication remains founder-controlled.
- **Do not weaken public rate-limit/abuse controls** to make registry submission easier.
  A directory listing can increase unauthenticated traffic, so those controls must remain
  production-ready.
- **Do not invent a second MCP contract for registry metadata.** The public hosted tool
  definitions are canonical; discovery metadata should stay aligned with them.

## Discovery surface

The hosted server's public tool metadata and the well-known server card are derived from
the canonical MCP contract in the main Pointmoon repository. `server.json` should
describe that live surface, not an obsolete hand-maintained copy.
