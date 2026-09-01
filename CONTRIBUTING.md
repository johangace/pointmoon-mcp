# Contributing

Thanks for your interest in `pointmoon-mcp`. This repo is the open connector and the public
field-truth contract for Pointmoon's hosted MCP server. The hosted server does the work;
this repo is a thin stdio wrapper plus documentation.

## Scope

Good contributions here:

- Fixes and improvements to the stdio connector (`bin/pointmoon-mcp.mjs`).
- Clarifications to the README or [CONTRACT.md](./CONTRACT.md).
- Better client setup examples for additional MCP clients.
- New runnable examples in [`examples/`](./examples/).

Out of scope (it lives in the hosted service, not here):

- How any value is computed, sourced, or scored.
- New data domains or sources.

## Running the connector

The connector speaks MCP over stdio and calls the hosted API. Try it against the live host:

```bash
node bin/pointmoon-mcp.mjs
```

Then send a JSON-RPC `initialize` / `tools/list` / `tools/call` line on stdin. Point it at a
local Pointmoon during development with `POINTMOON_BASE_URL`.

## Running the examples

```bash
npm run examples          # node examples/run-all.mjs — every example, against the hosted server
npm run examples:drill    # proves the check above can actually go red
```

Both need only Node 18+; there is nothing to install. CI runs both on every push and
pull request. If you add an example, add it to the `EXAMPLES` list in
`examples/run-all.mjs` and end it with `assertClaims(...)` so a silent regression fails
the build.

## Pull requests

- Keep changes small and focused.
- No secrets, tokens, or keys in any committed file.
- Match the existing style; the connector is plain ESM with no dependencies.
- If you touched anything under `examples/`, say in the PR that `npm run examples`
  passed and paste the tail of the run.

## License

By contributing you agree your contributions are licensed under [Apache-2.0](./LICENSE).
