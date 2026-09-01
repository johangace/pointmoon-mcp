# Listing `pointmoon` on the official MCP Registry

**Publishing to the registry is a founder action.** This repository contains the
validated payload, a preflight that proves the payload is publishable, and this note
saying exactly which credential is needed and in what order. It contains no publish
step, no registry token, no `secrets.*` reference, and no CI job that could publish.
That absence is the design, not an omission — the same rule as
[`RELEASING.md`](./RELEASING.md).

---

## Where we are

Measured **2026-09-01**:

```console
$ curl "https://registry.modelcontextprotocol.io/v0/servers?search=pointmoon"
{"servers":[],"metadata":{"count":0}}
```

Pointmoon is absent from the one registry that agent clients read to populate their
server catalogs. The hosted server is healthy and listable today — `/api/health` is
200 and `/api/mcp` `tools/list` returns `field_truth` — it simply is not listed.

## What is in the repository

| file | what it is |
| --- | --- |
| [`server.json`](./server.json) | The registry payload. Describes **both** distribution paths: the hosted remote at `https://pointmoon.vercel.app/api/mcp` and the npm package `pointmoon-mcp`. |
| [`scripts/registry-preflight.mjs`](./scripts/registry-preflight.mjs) | One command. Validates and reports; never publishes. |
| `mcpName` in [`package.json`](./package.json) | The npm ownership marker the registry reads. Present in this tree; **not yet in the artifact on npm** — see the gate below. |

## The one command

```bash
npm run registry:preflight
```

It fetches the official `mcp-publisher` binary if you do not have one (into the OS temp
dir, never into this repo), runs `mcp-publisher validate` — the registry's own
validator, against the live schema named by `server.json`'s own `$schema` field, so
nothing here is hand-checked — and then checks the things `validate` does not:

- the `$schema` URL really serves that schema (`$id` matches, HTTP 200);
- the remote endpoint in `server.json` actually answers `tools/list` with `field_truth`
  — the registry requires a remote server to be publicly accessible at its URL, and an
  entry pointing at a dead endpoint is worse than no entry;
- `package.json`'s `mcpName` matches `server.json`'s `name` (the registry requires
  this), and the two version fields are in step;
- whether the **published** npm artifact carries the ownership marker;
- what is currently in the registry under this name.

It exits non-zero only for things fixable in this repository. Founder-only gates are
reported as `GATE` and do not fail the run — a gate that can never be cleared by a
build is not a broken build.

It runs `mcp-publisher` in `validate` mode only. `validate` is read-only and
unauthenticated: it cannot publish, and the preflight never calls `login`, `publish` or
`status`.

## The gates, and the credential each one needs

Two gates stand between the validated payload and a live listing. Neither can be
cleared from CI or by an agent.

### Gate 1 — the npm publish credential (rotate first)

**Publishing `pointmoon-mcp` is gated on a credential rotation that has not happened
yet.** That rotation is tracked privately, not in this public repository. Nothing
involving npm may happen before it — this is the same gate
[`RELEASING.md`](./RELEASING.md) opens with, and it now blocks the registry listing too,
for a reason that is easy to miss:

The registry does not take our word for who owns the npm package. It reads
`mcpName` out of the **published** `package.json` and checks it against
`server.json`'s `name`. The artifact currently on npm — `pointmoon-mcp@0.1.0`,
published 2026-06-17 — predates that field, so it does not carry it:

```console
$ curl -s https://registry.npmjs.org/pointmoon-mcp | jq '.versions["0.1.0"].mcpName'
null
```

This tree carries it. The artifact does not. Closing that needs a republish, and a
republish needs the rotated credential. Until then the npm half of the entry cannot
verify.

### Gate 2 — GitHub OAuth device flow for the namespace

`server.json` claims the name `io.github.johangace/pointmoon`. The registry grants the
`io.github.<account>/*` namespace only to someone who proves they are that GitHub
account, through an **interactive OAuth device flow**:

```console
$ mcp-publisher login github
Logging in with github...

To authenticate, please:
1. Go to: https://github.com/login/device
2. Enter code: ABCD-1234
```

A human, at a browser, entering a code. There is no non-interactive equivalent that
belongs in this repository: the GitHub Actions path uses OIDC, which would mean this
repo could publish to the registry on its own — the same control we deliberately do not
give it for npm.

## The order, when both gates are clear

1. **Rotate the npm publish credential** (founder; the previous one revoked, not merely
   replaced). Nothing below may happen first.
2. **Republish `pointmoon-mcp`** following [`RELEASING.md`](./RELEASING.md) — its
   conformance step also says whether the connector needs a freshness pass. The new
   `package.json` carries `mcpName`, so the published artifact will too. npm versions
   are immutable, so this is a new version number.
3. **Put the published version into `server.json`** — both `version` (the server
   version) and `packages[0].version` (the npm version). `npm run registry:preflight`
   fails if they drift from `package.json`.
4. **Re-run the preflight.** Expect zero failures and the npm gate now closed:
   `[  ok  ] npm ownership marker`.
5. **Authenticate:** `mcp-publisher login github`, as the account that owns
   `io.github.johangace/*`.
6. **Publish:** `mcp-publisher publish`, from the repository root.
7. **Verify it took**, from outside:
   ```bash
   curl "https://registry.modelcontextprotocol.io/v0/servers?search=pointmoon"
   ```
   Expect our entry, with the hosted `/api/mcp` remote and the npm package both listed.
8. **Fill in the link in [`README.md`](./README.md)** — the "Find it in the MCP
   Registry" section currently says the entry does not exist yet, on purpose. Replace
   that with the live entry. Do not add the link before step 7 returns it.

## Two things deliberately not done here

- **No CI publish job**, for the registry or for npm. A publish step would mean this
  repository holds a credential that can overwrite what strangers install and what
  clients discover. The founder-with-a-fresh-credential *is* the control; automating it
  removes the control and adds nothing, because listings here are rare and deliberate.
- **No listing before the rate-limit work lands.** A registry entry invites
  unauthenticated public traffic at the hosted server. That is tracked separately and is
  a hard gate on the publish, not on this preparation.

## Which surface `server.json` describes

`server.json` describes the tool surface that `tools/list` on the live server actually
returns — seven inputs, including `place`. It does **not** follow
`/.well-known/mcp/server-card.json`, which is stale: the card still advertises
`field_truth` with only `lat`/`lng`/`city` and `required: ["lat","lng"]`. The card is
tracked and fixed elsewhere; the registry entry follows the live protocol surface,
because that is what a client actually calls.
