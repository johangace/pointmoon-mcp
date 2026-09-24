# Releasing `pointmoon-mcp`

**Publishing this package is a founder action. It is deliberately not automated, and
this repository contains no publish step, no release trigger, no `NODE_AUTH_TOKEN` and
no `secrets.*` reference. That absence is the design, not an omission — do not add one.**

There is **no credential-rotation prerequisite**. Use a valid founder-controlled npm
publishing credential or supported npm authentication method at publish time. Publishing
credentials stay outside this repository and CI.

---

## What conformance says right now

As of **2026-09-23**, the published `pointmoon-mcp@0.1.0` artifact is behind the hosted
server.

The important measured drift is:

- hosted MCP advertises `field_truth` **and** `step_outside`;
- published `0.1.0` does not yet advertise `step_outside`;
- agent-facing descriptions have also moved;
- the hosted and published `field_truth` input shape still agrees on the seven public
  inputs.

That means a republish is required before the package and hosted server can be considered
conformant again. The failing published-artifact conformance check is useful evidence of
that drift; do not weaken it to make a release PR green.

## Release order

1. **Run the negative-control drill and current published-artifact conformance:**
   ```bash
   node conformance/drill.mjs   # must exit 0 — proves the check can go red
   node conformance/run.mjs     # measures CURRENT published artifact vs hosted server
   ```
   The second command may exit non-zero before a release when the published artifact is
   genuinely behind. Read the named drift; do not paper it over.

2. **Bring `bin/pointmoon-mcp.mjs` into line with the hosted public server** for the
   intended release: public tool list, descriptions, annotations and initialize metadata.
   Do not invent a connector-only public contract.

3. **Keep version metadata in step.** Update `package.json`,
   `bin/pointmoon-mcp.mjs`'s `serverInfo.version`, and `server.json` together.

4. **Confirm what would ship:**
   ```bash
   npm pack --dry-run
   ```
   Expect the public package files only. Conformance fixtures, examples and this release
   note are repo tooling and should not accidentally become runtime dependencies.

5. **Publish** — founder action, using valid npm publish access:
   ```bash
   npm publish --access public
   ```

6. **Re-run conformance against the newly published artifact:**
   ```bash
   node conformance/run.mjs
   ```
   Expect zero release-blocking drift. This is the evidence that the public package and
   hosted server agree.

7. **Update the "Verified against the hosted contract" section of
   [`README.md`](./README.md)** with the new version, contract version and date, and tag
   the release.

8. **Then complete the MCP Registry publication steps** in
   [`REGISTRY.md`](./REGISTRY.md). The registry verifies npm ownership using the
   `mcpName` carried by the published package, so the fresh package must exist first.

## Why there is no CI publish job

`pointmoon-mcp` is something strangers install and trust. Publishing remains an
explicit founder-controlled action rather than a repository side effect.

That control does **not** require routine credential rotation. It requires only that the
publishing authentication be valid, appropriately controlled, and kept out of source
control/CI unless the release policy is deliberately changed later.
