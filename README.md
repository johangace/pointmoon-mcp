# pointmoon-mcp

**Ground truth for agents acting in the physical world. Sourced, time-stamped, or silent.**

Pointmoon is an agent-callable trust layer. Give it a coordinate (or a place name) and it returns sourced, current physical and environmental field-truth: weather, air quality, light and sky, water, terrain, notable natural events. Every fact it returns carries its own provenance — which provider observed it (`source`), when (`observedAt`), how long it stays fresh (`ttlMinutes`), and a `confidence` score. When a fact is unknown, stale, or low-confidence, Pointmoon returns **typed silence with a reason** instead of inventing a value.

That is the whole point: a fluent model is good at language and bad at knowing whether it is making the weather up. Pointmoon refuses to hallucinate about physical reality. It hands your model sourced observational tokens to phrase in its own words, or it tells you, explicitly, that it does not know. The trust envelope and the honest silence are the product. Pointmoon grounds; your model speaks.

This repo is the open connector and the public field-truth contract. The hosted server does the work — there is nothing to run and no secrets to hold.

- **Live demo:** https://pointmoon.vercel.app/now
- **npm:** https://www.npmjs.com/package/pointmoon-mcp
- **Contract:** [CONTRACT.md](./CONTRACT.md)
- **License:** Apache-2.0

---

## How it works

Pointmoon is a hosted remote MCP server. You add it as a tool; your agent calls `field_truth` with a location; the server returns sourced tokens or typed silence. There is no install, no key, and no model running on your side. The connector in this repo is a thin stdio wrapper over the same hosted HTTP API for clients that prefer a local command.

---

## Quickstart

### Claude Desktop — remote (recommended)

Bridge the hosted server in over stdio with `mcp-remote`. Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "pointmoon": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://pointmoon.vercel.app/api/mcp"]
    }
  }
}
```

If your client supports native remote (HTTP) MCP servers directly, point it at:

```json
{
  "mcpServers": {
    "pointmoon": {
      "url": "https://pointmoon.vercel.app/api/mcp"
    }
  }
}
```

### Cursor

In `~/.cursor/mcp.json` (or the project `.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "pointmoon": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://pointmoon.vercel.app/api/mcp"]
    }
  }
}
```

### stdio package (local command)

No clone needed. The published package runs the connector and talks to the hosted API:

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

Override the upstream for local development with `POINTMOON_BASE_URL`.

### No MCP — plain HTTP

The same field-truth is one request away. Use `audience=facts` for the prose-free shape:

```bash
curl "https://pointmoon.vercel.app/api/moon?lat=42.36&lng=-71.06&audience=facts"
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

A compact, real-shaped example:

```json
{
  "facts": {
    "signals": [
      {
        "id": "temperature",
        "label": "Air temperature",
        "value": "11.4°C",
        "source": "open-meteo",
        "confidence": 0.95
      },
      {
        "id": "wind",
        "label": "Wind",
        "value": "14 km/h NW",
        "source": "open-meteo",
        "confidence": 0.9
      }
    ],
    "fieldSnapshot": {
      "weather": {
        "temperatureC": 11.4,
        "windKph": 14,
        "source": "open-meteo",
        "observedAt": "2026-06-17T13:00:00Z",
        "ttlMinutes": 30,
        "confidence": 0.95
      }
    },
    "meta": { "lat": 42.36, "lng": -71.06, "resolvedAt": "2026-06-17T13:05:11Z" }
  },
  "notices": [
    { "kind": "license", "source": "open-meteo", "text": "Weather data by Open-Meteo (CC BY 4.0)." }
  ]
}
```

Typed silence for an axis it cannot ground:

```json
{
  "fieldSnapshot": {
    "water": {
      "silent": true,
      "reason": "no_gauge_in_range",
      "confidence": 0
    }
  }
}
```

Treat the returned readings as the only verified facts. Render them into your own wording; do not invent conditions Pointmoon did not report.

---

## License

[Apache-2.0](./LICENSE).
