# Examples

Runnable examples against the **hosted** Pointmoon server. No install, no key, no
account, no local server. Node 18+ is the only prerequisite — every file here uses
Node built-ins and nothing else.

```bash
git clone https://github.com/johangace/pointmoon-mcp.git
cd pointmoon-mcp
node examples/01-first-call.mjs
```

That is the whole setup. There is no `npm install` step because there is nothing
to install.

| file | what it shows |
| --- | --- |
| [`01-first-call.mjs`](./01-first-call.mjs) | Your first `field_truth` call at a coordinate: sourced tokens, and where the freshness envelope (`observedAt` + `ttlMinutes`) lives. |
| [`02-by-place-name.mjs`](./02-by-place-name.mjs) | `field_truth({ place: "Lisbon" })` — call by name instead of coordinates, and see what the name resolved to. Takes a place as `argv[2]`. |
| [`03-typed-silence.mjs`](./03-typed-silence.mjs) | An open-ocean coordinate where several axes cannot be grounded. Silence is a normal answer, not an error. |
| [`04-plain-http.mjs`](./04-plain-http.mjs) | The same field-truth with no MCP at all — one `GET /api/moon?audience=facts`. |
| [`run-all.mjs`](./run-all.mjs) | Runs all of the above and exits non-zero if any of them stops returning claims. This is what CI executes. |
| [`ci-failure-drill.mjs`](./ci-failure-drill.mjs) | Proves `run-all.mjs` can actually fail, by pointing it at a claim-less stub. |
| [`lib/pointmoon.mjs`](./lib/pointmoon.mjs) | ~60 lines of shared client: one POST to `/api/mcp`, one SSE frame parsed, plus the assertions. |

## What you get back

`field_truth` returns the `audience=facts` envelope. The two keys you will use:

- **`facts.signals[]`** — a flat list of discrete sourced tokens, each
  `{ id, source, label, value, confidence, evidence[] }`. A signal present here is a
  claim Pointmoon stands behind.
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
          "ttlMinutes": 90,          // the producer's own freshness promise
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

A consumer that hard-fails on an unresolved axis has missed the contract. Render the
unknown as quiet, never as a guess. See [CONTRACT.md](../CONTRACT.md), which also
describes the equivalent explicit `{ "silent": true, "reason": ... }` form.

## Pointing somewhere else

Every example honours `POINTMOON_BASE_URL`:

```bash
# against a Pointmoon you are running yourself
POINTMOON_BASE_URL=http://127.0.0.1:3110 node examples/01-first-call.mjs

# watch the check go red
POINTMOON_BASE_URL=https://pointmoon.invalid node examples/run-all.mjs; echo $?   # 1
```

## The one rule

The returned readings are the only verified facts. Render them into your own
wording; do not add conditions Pointmoon did not report. Pointmoon grounds; your
model speaks.
