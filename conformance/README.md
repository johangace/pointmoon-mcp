# Conformance

Does the package a stranger installs still speak the contract we serve?

`pointmoon-mcp@0.1.0` was published on 2026-06-17 and has never been republished, while
the engine behind the hosted server kept moving. Until now, nothing had ever asserted
that the two agree. The next contract change would have landed that break silently, on
the first outside integrator, in the surface we would learn about it last.
(johangace/pointmoon#72)

```bash
node conformance/run.mjs      # the real check: published package vs. hosted server
node conformance/drill.mjs    # the negative control, entirely offline
```

## What is compared

| side | what it is |
| --- | --- |
| **published npm artifact** | `npx -y pointmoon-mcp@latest`, driven over stdio like an MCP client. **Not** `bin/pointmoon-mcp.mjs` in this tree — the tree is not what strangers have. |
| **hosted server** | `https://pointmoon.vercel.app/api/mcp` — `tools/list` and one live `tools/call`. |

The run goes red, **naming the field**, when the tool name moves, when any input-schema
property appears on one side and not the other, when a shared property changes `type` or
`enum` or `required` changes, when the live envelope's shape moves (top-level keys,
`facts` keys, `fieldSnapshot` axes, `schemaVersion`), or when the trust block
(`notices` / `provenance` / per-signal `source` and `confidence` / the freshness
quadruple) or the typed-silence contract is missing or malformed.

## Why `tools/list` is the truth, not the server card

`/.well-known/mcp/server-card.json` is a static advertisement and is currently stale —
it lists `field_truth` with only `lat`/`lng`/`city` and `required: ["lat", "lng"]`, with
no `place`, while `/api/mcp` correctly accepts `place` (filed as
johangace/pointmoon#76). `tools/list` is the surface a client actually negotiates
against, so it is what this job compares to. Pointing the comparator at the card would
make it red on arrival for something that is not the connector's fault.

## What is deliberately not compared

**Live values.** Two calls seconds apart legitimately differ: an upstream source that
timed out on one call resolves on the next. Comparing values would produce a flaky red,
and a detector people learn to ignore fails the same way a detector that cannot go red
fails.

**Prose.** Tool and property descriptions are reported as loud notes, not failures. They
move for editorial reasons. They are still worth a republish — agents choose tools by
that text — so they are never swallowed, just not fatal.

## The drill

`drill.mjs` runs first in CI (`conformance` declares `needs: conformance-drill`), so a
green conformance result can never be reported by a comparator that was not first proven
capable of going red. It injects fourteen deliberate divergences — a missing `place`, an
invented `zoom`, a retyped `lat`, a narrowed enum, a newly-required argument, a
server-side tool the package lacks, a new snapshot axis, a moved `schemaVersion`, a
missing trust block, an unsourced claim, silence with no reason — and fails unless each
one comes back red *naming that exact field*. Three of them drive the whole runner end
to end against stubs, so the runner itself cannot be weakened while the comparator's own
cases stay green. A fifteenth case runs the runner against two *agreeing* stubs and
fails if it goes red: a detector that cries drift on agreement is noise, not a detector.

It needs no network: a stub connector on stdio and a stub server on `127.0.0.1`.

## Releasing

When conformance reports drift, the fix is a republish — and that is a founder action
behind an unrotated credential. See [`../RELEASING.md`](../RELEASING.md).
