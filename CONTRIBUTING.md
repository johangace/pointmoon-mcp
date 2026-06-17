# Contributing

Thanks for your interest in `pointmoon-mcp`. This repo is the open connector and the public
field-truth contract for Pointmoon's hosted MCP server. The hosted server does the work;
this repo is a thin stdio wrapper plus documentation.

## Scope

Good contributions here:

- Fixes and improvements to the stdio connector (`bin/pointmoon-mcp.mjs`).
- Clarifications to the README or [CONTRACT.md](./CONTRACT.md).
- Better client setup examples for additional MCP clients.

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

## Pull requests

- Keep changes small and focused.
- No secrets, tokens, or keys in any committed file.
- Match the existing style; the connector is plain ESM with no dependencies.

## License

By contributing you agree your contributions are licensed under [Apache-2.0](./LICENSE).
