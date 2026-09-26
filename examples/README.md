# Examples

Runnable examples against the **hosted** Pointmoon server. Node 18+ is the only
prerequisite; these examples use Node built-ins and require no package install.
The existing hosted demo path is anonymous. Where supported, the new responsive
example can send an optional server-side API key; it does not provision access.

```bash
git clone https://github.com/johangace/pointmoon-mcp.git
cd pointmoon-mcp
node examples/01-first-call.mjs
```

| file | what it shows |
| --- | --- |
| [`01-first-call.mjs`](./01-first-call.mjs) | Your first `field_truth` call at a coordinate: sourced tokens, and where the freshness envelope (`observedAt` + `ttlMinutes`) lives. |
| [`02-by-place-name.mjs`](./02-by-place-name.mjs) | `field_truth({ place: "Lisbon" })` — call by name instead of coordinates, and see what the name resolved to. Takes a place as `argv[2]`. |
| [`03-typed-silence.mjs`](./03-typed-silence.mjs) | An open-ocean coordinate where several axes cannot be grounded. Silence is a normal answer, not an error. |
| [`04-plain-http.mjs`](./04-plain-http.mjs) | The same field-truth with no MCP at all — one `GET /api/moon?audience=facts`. |
| [`05-world-responsive.mjs`](./05-world-responsive.mjs) | Select application-authored content and render a display from sourced context, with a normal fallback when weather is unknown or stale. |
| [`world-responsive/`](./world-responsive/README.md) | A local browser display, an opt-in labelled synthetic demo, and a pure consumer-side extension recipe. |
| [`run-all.mjs`](./run-all.mjs) | Runs the one-shot live examples and offline responsive-content tests; any failure exits non-zero. The long-running display server is not started by CI. |
| [`ci-failure-drill.mjs`](./ci-failure-drill.mjs) | Proves `run-all.mjs` can actually fail, by pointing it at a claim-less stub. |
| [`lib/pointmoon.mjs`](./lib/pointmoon.mjs) | Shared HTTP/MCP client and sourced-claim assertions. |

## Content and display quickstart

```bash
# No API call: synthetic input is explicitly labelled on the page.
node examples/world-responsive/server.mjs --demo

# Live API, fixed public example location; open http://127.0.0.1:4311.
node examples/world-responsive/server.mjs
```

The cafe cards are sample application content, not Pointmoon recommendations.
Change a selector in your own application without changing Pointmoon's evidence.
See the [guide](./world-responsive/README.md) for freshness handling, optional
server-side keys, source notices and the local-demo security boundary.

## What you get back

`field_truth` returns the `audience=facts` envelope. The two keys you will use:

- **`facts.signals[]`** — a flat list of discrete sourced tokens, each
  `{ id, source, label, value, confidence, evidence[] }`.
- **`facts.fieldSnapshot`** — the per-axis snapshot. Signals are lean; the freshness
  envelope lives here, on the matching reading. `fieldSnapshot.weather.current`
  carries `source`, `observedAt`, and the producer-declared `ttlMinutes`.

A real excerpt, captured from `01-first-call.mjs`:

```jsonc
{
  "schemaVersion": "field-truth@1.1.0",
  "facts": {
    "signals": [
      { "id": "nature.weather.temperature", "source": "weather", "label": "Temperature",
        "value": 18.6, "confidence": 0.9, "evidence": ["temperatureC=18.6"] },
      { "id": "nature.moon_phase", "source": "astronomy", "label": "Moon phase",
        "value": "waning gibbous", "confidence": 0.95, "evidence": ["illuminationPct=77"] }
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
  }
}
```

This historical excerpt is not current weather. Provider context can be
forecast/model-derived; a source and timestamp do not make it a measurement at
the exact requested spot. Preserve the response's source notices and distinguish
application selections from underlying evidence.

## Reading silence

On the `facts` surface, silence is **per axis**. Where a source cannot responsibly
speak, that axis marks its provider `"unresolved"` and gives a
`resolutionReason`, and `meta.liveReadiness.status` drops. Real excerpt from
`03-typed-silence.mjs` at an open-ocean coordinate:

```jsonc
{
  "facts": {
    "fieldSnapshot": {
      "place": { "provider": "unresolved", "resolutionStatus": "unresolved",
                 "resolutionReason": "provider-empty", "placeName": null },
      "hydro": { "provider": "unresolved", "resolutionStatus": "unresolved",
                 "resolutionReason": "timeout", "distanceToWaterKm": null }
    },
    "meta": { "liveReadiness": { "status": "thin", "score": 1 } }
  }
}
```

A consumer should not fabricate a replacement for an unresolved axis. Render an
honest fallback. See [CONTRACT.md](../CONTRACT.md), which also describes the
explicit `{ "silent": true, "reason": ... }` form.

## Pointing somewhere else

The clients honour `POINTMOON_BASE_URL`:

```bash
# A local development endpoint; not a promise of public engine source.
POINTMOON_BASE_URL=http://127.0.0.1:3110 node examples/01-first-call.mjs

# Watch the check go red.
POINTMOON_BASE_URL=https://pointmoon.invalid node examples/run-all.mjs; echo $?   # 1
```

## The one rule

Render only the conditions the response actually supports. Keep the application's
wording and choices separate from source data, preserve attribution, and do not
claim unknown or stale conditions are current.
