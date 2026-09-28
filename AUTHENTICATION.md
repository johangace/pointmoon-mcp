# Configured API keys in the stdio connector

The connector accepts an optional `POINTMOON_API_KEY` from its process environment.
It sends that value as an `Authorization: Bearer ...` header on its HTTP requests.
The key is not an MCP tool argument and does not appear in discovery metadata.

**Release boundary:** this describes the source in this branch, not a claim that
npm `latest` contains it or that hosted paid onboarding is live. A configured key
only becomes useful for account access when the target service validates it and
has provisioned the account. Client-side tests cannot establish that server state.
The connector does not create accounts, sell plans, verify subscriptions, or
change hosted entitlements. Follow [RELEASING.md](./RELEASING.md) before publishing.

## Start from a source checkout

Use a supported local secret manager or your MCP client's private environment
configuration to supply `POINTMOON_API_KEY`. Do not put the value in a prompt,
`tools/call`, a shared MCP config, a URL, a public browser/native bundle, or git.

For a shell session, read it without adding it to shell history:

```bash
read -rs -p 'Pointmoon API key: ' POINTMOON_API_KEY; printf '\n'
export POINTMOON_API_KEY
node bin/pointmoon-mcp.mjs
# After the process exits:
unset POINTMOON_API_KEY
```

The process speaks newline-delimited MCP JSON-RPC, not interactive shell commands.
For example, a client can send this tool request after initialization:

```json
{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"field_truth","arguments":{"place":"Boston"}}}
```

Point your local MCP client at the absolute path to `bin/pointmoon-mcp.mjs` using
`node` as the command, and supply the key through that client's private process
environment. Environment interpolation and secret-storage behavior are
client-specific: do not assume `${POINTMOON_API_KEY}` expands inside an arbitrary
JSON file. A desktop application may not inherit a terminal's environment.

The connector forwards the same configured identity for `field_truth`,
`step_outside` and the existing compatibility tools. The server decides what
that identity can do. A Pointmoon API key is not an internal service token.

Leaving the variable unset or empty preserves the anonymous path. Whitespace or
malformed nonempty credentials fail explicitly; they are not trimmed into an
anonymous request. A 401 response is returned to the MCP client as an error,
without retrying anonymously.

## Endpoint and credential handling

The default remains `https://pointmoon.ai`. Set `POINTMOON_BASE_URL` only to a
server you control and trust to receive the configured credential. The variable
is local process configuration, never a model-supplied destination.

HTTPS is required except for development servers at literal `127.0.0.1` or
`[::1]` loopback addresses. Use a test-only credential with local development:

```bash
POINTMOON_BASE_URL=http://127.0.0.1:3110 node bin/pointmoon-mcp.mjs
```

URLs containing credentials, query parameters or fragments are rejected. Plain
HTTP `localhost` and non-loopback hosts are rejected; use the literal loopback
address above. Redirects are not followed, including same-origin redirects, so
neither the Pointmoon key nor an eBird key is forwarded to a redirect target.

The existing optional `ebirdApiKey` tool input remains a separate, header-only
upstream credential. This patch does not change that contract or grant any data
rights. A Pointmoon key does not substitute for an eBird key or permission.

Only documented tool-input names are accepted. Previously the connector could
forward arbitrary extra arguments. Such arguments now produce `invalid_arguments`
before a request is sent; undocumented pass-through parameters are not supported.
Tool names, listed schemas and successful field payloads are otherwise unchanged.

## Errors are not silence

A failed request sets MCP `isError: true` and supplies a small `structuredContent`
object with an `error` code, an HTTP `status` when available, and bounded numeric
`retryAfterSeconds` when supplied by the service. Non-numeric Retry-After values
are omitted. There is no automatic retry.

Common codes: `invalid_config`, `invalid_arguments`, `unauthorized`, `forbidden`,
`rate_limited`, `http_error`, `upstream_error`, `invalid_response`, `request_failed`
and `timeout`. The existing request deadline remains 30 seconds.

Raw upstream error bodies, exception text, header values and parser excerpts
are not returned to the model or written to stderr. This is not a general-purpose
filter for arbitrary content supplied by a trusted server in a successful field
response. Public-output filtering, server logging and entitlement enforcement
must also be secured on the host.

A valid typed-silence result remains a successful response. A 401, 429, malformed
response or service-error envelope is not described as missing environmental
knowledge.

## Verification

```bash
npm test
```

The native Node tests spawn the actual stdio process and use local HTTP servers,
with only synthetic credentials. They cover header-only identity, eBird separation,
anonymous compatibility, both public tools and compatibility routes, rejected
credentials, sanitized errors, malformed responses, redirects, configuration and
argument injection, discovery, and valid typed silence. No production key, payment,
external API call, or dependency installation is required.

This follows the MCP distinction between HTTP authorization and local stdio
credentials retrieved from the environment:
https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization
