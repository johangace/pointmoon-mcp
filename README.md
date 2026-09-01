# pointmoon-mcp

**Ground truth for agents acting in the physical world. Sourced, time-stamped, or silent.**

Pointmoon is an agent-callable trust layer. Give it a coordinate (or a place name) and it returns sourced, current physical and environmental field-truth: weather, air quality, light and sky, water, terrain, notable natural events. Every fact it returns carries its own provenance — which provider observed it (`source`), when (`observedAt`), how long it stays fresh (`ttlMinutes`), and a `confidence` score. When a fact is unknown, stale, or low-confidence, Pointmoon returns **typed silence with a reason** instead of inventing a value.

That is the whole point: a fluent model is good at language and bad at knowing whether it is making the weather up. Pointmoon refuses to hallucinate about physical reality. It hands your model sourced observational tokens to phrase in its own words, or it tells you, explicitly, that it does not know. The trust envelope and the honest silence are the product. Pointmoon grounds; your model speaks.

This repo is the open connector and the public field-truth contract. The hosted server does the work — there is nothing to run and no secrets to hold.

- **Run something in five minutes:** [examples/](./examples/)
- **Live demo:** https://pointmoon.vercel.app/now
- **npm:** https://www.npmjs.com/package/pointmoon-mcp
- **Contract:** [CONTRACT.md](./CONTRACT.md)
- **License:** Apache-2.0

---

## How it works

Pointmoon is a hosted remote MCP server. You add it as a tool; your agent calls `field_truth` with a location; the server returns sourced tokens or typed silence. There is no install, no key, and no model running on your side. The connector in this repo is a thin stdio wrapper over the same hosted HTTP API for clients that prefer a local command.

---

## Five minutes, nothing installed

If you just want to see a real payload, you do not need an MCP client at all.
Node 18+ is the only prerequisite — there is no `npm install` step because there is
nothing to install:

```bash
git clone https://github.com/johangace/pointmoon-mcp.git
cd pointmoon-mcp
node examples/01-first-call.mjs
```

Real output, trimmed:

```
Pointmoon @ https://pointmoon.vercel.app
schemaVersion: field-truth@1.1.0

Pointmoon field-truth: 121 sourced signals for 42.36,-71.06 (each carries source/observedAt/ttlMinutes/confidence).

Sourced signals (121 total, first few):
  Time of day                afternoon          [source: universal, confidence: 1]
  Moon phase                 waning gibbous     [source: astronomy, confidence: 0.95]
  Habitat type               built-up           [source: place, confidence: 0.62]
  ... and 113 more

Freshness envelope for the weather reading:
  source:      open-meteo-forecast-model
  observedAt:  2026-09-01T20:45:00.000Z
  ttlMinutes:  90   <- producer-declared freshness window
  temperature: 18.6°C
```

Four examples ship here — a first call, a call by place name, a coordinate where
Pointmoon goes deliberately silent, and the same thing over plain HTTP with no MCP.
See [examples/](./examples/).

---

## Add it to your MCP client

Every config below points at the hosted server, `https://pointmoon.vercel.app/api/mcp`.
No key, no account, no OAuth — it is a public read-only surface.

### Claude Code

```bash
claude mcp add --transport http pointmoon https://pointmoon.vercel.app/api/mcp
```

Or commit it to your project's `.mcp.json` so your team gets it too:

```json
{
  "mcpServers": {
    "pointmoon": {
      "type": "http",
      "url": "https://pointmoon.vercel.app/api/mcp"
    }
  }
}
```

Then check it landed with `/mcp` inside Claude Code.

### Claude Desktop

Remote MCP servers are added through the UI, as a **custom connector** — not through
`claude_desktop_config.json`, which is for local stdio servers:

1. Open **Settings** (`Ctrl+,` / `⌘,`) → **Connectors**
2. **Add** → **Add custom connector**
3. Paste `https://pointmoon.vercel.app/api/mcp`, then **Add**

There is no authentication step; Pointmoon needs none.

If you would rather keep it in the config file, use the stdio connector instead — the
published package talks to the same hosted API:

```json
{
  "mcpServers": {
    "pointmoon": {
      "command": "npx",
      "args": ["-y", "pointmoon-mcp"]
    }
  }
}
```

### Cursor

In `~/.cursor/mcp.json` for every project, or `.cursor/mcp.json` for one:

```json
{
  "mcpServers": {
    "pointmoon": {
      "url": "https://pointmoon.vercel.app/api/mcp"
    }
  }
}
```

### Any other MCP client

Pointmoon speaks the MCP **Streamable HTTP** transport at
`https://pointmoon.vercel.app/api/mcp`. Clients that only support stdio can bridge to
it with the `pointmoon-mcp` package above (or any generic stdio-to-HTTP bridge).
`POINTMOON_BASE_URL` overrides the upstream if you are running Pointmoon yourself.

You can confirm the endpoint answers before wiring anything up:

```bash
curl -s https://pointmoon.vercel.app/api/mcp \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

### No MCP — plain HTTP

The same field-truth is one request away. Use `audience=facts` for the prose-free shape:

```bash
curl "https://pointmoon.vercel.app/api/moon?audience=facts&surface=open&lat=42.36&lng=-71.06"
```

---

## The tool: `field_truth`

Get sourced, current physical and environmental field-truth for a location.

**Inputs**

| input | type | notes |
| --- | --- | --- |
| `lat` | number | Latitude, decimal degrees WGS84 (e.g. `42.36`). Pair with `lng`. |
| `lng` | number | Longitude, decimal degrees WGS84 (e.g. `-71.06`). |
| `place` | string | A place name to geocode (e.g. `"Yosemite Valley"`) when you do not have coordinates. Provide either `place` or `lat`/`lng`; `lat`/`lng` win when both are given. |
| `city` | string | Optional human-readable label for echo/logging only. Does not geolocate. |
| `ebirdApiKey` | string | Optional bring-your-own [eBird](https://ebird.org/api/keygen) token. eBird is non-commercial-licensed, so bird observations are returned only when you supply your own key (sent as a header, never logged). Omit it and the bird axis stays silent. |

**Returns** the `audience=facts` shape: a list of sourced signals plus a per-domain field snapshot, each reading carrying `source`, `observedAt`, `ttlMinutes`, and `confidence` — or typed silence. See [CONTRACT.md](./CONTRACT.md) for the full envelope.

A trimmed excerpt of a real response (captured by `examples/01-first-call.mjs`):

```jsonc
{
  "schemaVersion": "field-truth@1.1.0",
  "facts": {
    "signals": [
      {
        "id": "nature.weather.temperature",
        "label": "Temperature",
        "value": 18.6,
        "source": "weather",
        "confidence": 0.9,
        "evidence": ["temperatureC=18.6"]
      },
      {
        "id": "nature.moon_phase",
        "label": "Moon phase",
        "value": "waning gibbous",
        "source": "astronomy",
        "confidence": 0.95,
        "evidence": ["illuminationPct=77"]
      }
    ],
    "fieldSnapshot": {
      "weather": {
        "current": {
          "observedAt": "2026-09-01T20:45:00.000Z",
          "source": "open-meteo-forecast-model",
          "ttlMinutes": 90,
          "epistemicType": "predicted",
          "temperatureC": 18.6
        }
      }
    },
    "meta": {
      "liveReadiness": {
        "status": "partial",
        "providers": { "weather": "open-meteo", "place": "osm", "hydro": "unresolved" }
      }
    }
  },
  "notices": {
    "attributionRequired": true,
    "sources": [
      {
        "source": "open-meteo",
        "license": "CC BY 4.0 (data); free API is non-commercial only",
        "attribution": "Weather data by Open-Meteo.com (CC BY 4.0)"
      }
    ]
  }
}
```

Signals are lean: they carry `source` and `confidence`, but not `observedAt` or
`ttlMinutes`. The freshness envelope lives on the matching `fieldSnapshot` reading —
`fieldSnapshot.weather.current` above declares a 90-minute window from `observedAt`.

Typed silence for an axis it cannot ground. On this surface it is per axis: the
provider is marked `"unresolved"` with a reason, and `meta.liveReadiness` drops.
Real excerpt from an open-ocean coordinate (`examples/03-typed-silence.mjs`):

```jsonc
{
  "facts": {
    "fieldSnapshot": {
      "place": {
        "provider": "unresolved",
        "resolutionStatus": "unresolved",
        "resolutionReason": "provider-empty",
        "placeName": null
      },
      "hydro": {
        "provider": "unresolved",
        "resolutionStatus": "unresolved",
        "resolutionReason": "timeout",
        "distanceToWaterKm": null
      }
    },
    "meta": { "liveReadiness": { "status": "thin", "score": 1 } }
  }
}
```

[CONTRACT.md](./CONTRACT.md) documents the equivalent explicit
`{ "silent": true, "reason": ..., "confidence": 0 }` form. Handle both: silence is a
normal, expected outcome, never an error and never a fabricated value.

Treat the returned readings as the only verified facts. Render them into your own wording; do not invent conditions Pointmoon did not report.

---

## Examples

[`examples/`](./examples/) holds four runnable files — a first call, a call by place
name, a coordinate where Pointmoon goes deliberately silent, and the same field-truth
over plain HTTP. They use only Node built-ins, run against the hosted server, and each
one asserts it got back at least one sourced claim.

CI runs them on every push, on every pull request, and once a day on a schedule, so a
hosted server that stops grounding shows up as a red build rather than as a stranger's
bad first five minutes. A companion drill (`examples/ci-failure-drill.mjs`) points the
same runner at a claim-less stub and fails if it does *not* go red — a check that
cannot fail would only be reporting safety it never verified.

---

## License

[Apache-2.0](./LICENSE).
