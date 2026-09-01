# Releasing `pointmoon-mcp`

**Publishing this package is a founder action. It is deliberately not automated, and
this repository contains no publish step, no release trigger, no `NODE_AUTH_TOKEN` and
no `secrets.*` reference. That absence is the design, not an omission — do not add one.**

---

## The gate

The npm publish token used for the 2026-06-17 launch **was exposed in plaintext during
that launch and has not been rotated.** Nothing may be published with it, including a
release that is otherwise ready. Rotation is a founder action tracked separately,
alongside the Smithery API key.

So the release stops here, on purpose: the conformance check
([`conformance/`](./conformance/)) proves whether a republish is *needed*, and this file
says what a founder must do, in order, when the credential is clean. It does not do it.

## What conformance says right now

As of **2026-09-01**, `pointmoon-mcp@0.1.0` (published 2026-06-17, 76 days earlier)
**still matches** the hosted `field-truth@1.1.0` contract on everything that governs a
call: the `field_truth` tool name, all seven input-schema properties, the live envelope
shape, the trust block and the typed-silence contract. Nothing is broken for anyone who
installed it.

What *has* drifted is agent-facing prose. Four input-property descriptions —
`place`, `city`, `adapterMode`, `ebirdApiKey` — read differently on the two sides. Agents
choose tools and arguments by that text, so a republish is warranted, but it is a
freshness release rather than a break. `conformance/run.mjs` reports these as notes and
does not fail the build for them; run it to see the current diff.

## The order, when the credential is clean

1. **Rotate the npm publish token** (founder; the exposed one must be revoked, not just
   replaced). Nothing below may happen first.
2. **Run the drill, then the conformance check, locally:**
   ```bash
   node conformance/drill.mjs   # must exit 0 — proves the check can go red
   node conformance/run.mjs     # against the CURRENTLY published package
   ```
   Read the notes. They are the diff a republish would close.
3. **Bring `bin/pointmoon-mcp.mjs` into line with the hosted server** for anything the
   conformance run reported — including the description notes, which are the point of a
   freshness release. Do not change the tool surface itself; that is a contract change
   and belongs upstream in the engine, not here.
4. **Bump `version` in `package.json`** (patch for a freshness release; minor if the
   input surface gained anything). Update the `serverInfo.version` string in
   `bin/pointmoon-mcp.mjs` in the same commit — it is hand-maintained and will otherwise
   report the old number to every client.
5. **Confirm what would ship:**
   ```bash
   npm pack --dry-run
   ```
   Expect exactly five files — `package.json`, `README.md`, `CONTRACT.md`, `LICENSE`
   and `bin/pointmoon-mcp.mjs`. `conformance/`, `examples/` and this file are repo-only
   and must not appear in the tarball. (Note that the published `0.1.0` tarball has only
   three: it predates `CONTRACT.md` and the current `LICENSE`, so a republish also
   delivers the public contract document to anyone who installs.)
6. **Publish** (founder, with the rotated token):
   ```bash
   npm publish --access public
   ```
7. **Re-run conformance against the new artifact**, which now resolves to the version
   just published:
   ```bash
   node conformance/run.mjs
   ```
   Expect zero notes and zero drifts. This is the only evidence that the republish
   actually closed the gap.
8. **Update the "Verified against the hosted contract" section of
   [`README.md`](./README.md)** with the new version, the contract version and the date,
   and tag the release.

## Why there is no CI publish job

`pointmoon-mcp` has one job on npm: to be the thing a stranger installs and trust. A
publish step in CI would mean this repository holds a credential that can overwrite that
artifact — and the last credential that could do so leaked. A human deciding to publish,
with a token that was rotated after the leak, is the control. Automating it removes the
control and adds nothing: releases here are rare and deliberate.
