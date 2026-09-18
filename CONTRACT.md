# Pointmoon field-truth contract

This document describes the public response contract for Pointmoon field-truth: the
`audience=facts` shape returned by the hosted MCP `field_truth` tool and by
`GET /api/moon?audience=facts`. It is an interface-level description. It is not a
description of how Pointmoon computes any value.

The governing principle: **Pointmoon emits sourced observational tokens with provenance,
freshness, and confidence — or typed silence. It does not write prose, and it does not
guess.** Every field below is answerable to that.

Longer-form contracts live on the engine, on `main`. Use these when this envelope
description is not enough. There is no `/docs` route on https://pointmoon.vercel.app;
these GitHub blob URLs are the same stable paths the product site already uses.

| Topic | Engine doc |
| --- | --- |
| Season reading | [`docs/SEASON_CONTRACT.md`](https://github.com/johangace/pointmoon/blob/main/docs/SEASON_CONTRACT.md) |
| eBird bring-your-own key | [`docs/EBIRD.md`](https://github.com/johangace/pointmoon/blob/main/docs/EBIRD.md) |
| Teachable doorway | [`docs/TEACHABLE_DOORWAY.md`](https://github.com/johangace/pointmoon/blob/main/docs/TEACHABLE_DOORWAY.md) |
| Envelope / API | [`docs/API_REFERENCE.md`](https://github.com/johangace/pointmoon/blob/main/docs/API_REFERENCE.md) |
| Silence | [`docs/SILENCE_CONTRACT.md`](https://github.com/johangace/pointmoon/blob/main/docs/SILENCE_CONTRACT.md) |
| MCP wiring | [`docs/MCP_SERVER.md`](https://github.com/johangace/pointmoon/blob/main/docs/MCP_SERVER.md) |
| All engine docs | [`docs/`](https://github.com/johangace/pointmoon/tree/main/docs) |

Season, eBird, and teachable doorway are summarized after the envelope so a
consumer landing here does not have to hunt the engine repo blindly. They do
not replace those docs.

---

## Response envelope

A successful response is a JSON object with these top-level keys:

| key | type | description |
| --- | --- | --- |
| `facts` | object | The field-truth payload. See below. |
| `notices` | array | Source licensing and attribution notices that apply to the data returned. |

`facts` contains:

| key | type | description |
| --- | --- | --- |
| `signals` | array | A flat list of discrete sourced readings, model-friendly for rendering. |
| `fieldSnapshot` | object | Per-domain readings, each carrying its own provenance and freshness. |
| `meta` | object | Resolution metadata for the request (resolved location, timestamps). |

---

## `facts.signals[]`

A flat, render-ready list. Each signal is one discrete claim:

| field | type | description |
| --- | --- | --- |
| `id` | string | Stable machine identifier for the reading (e.g. `temperature`, `wind`, `aqi`). |
| `label` | string | Human-readable label for the reading. |
| `value` | string \| number | The observed value. Strings are display-formatted; treat them as tokens to rephrase, not as final copy. |
| `source` | string | The provider that observed this value. |
| `confidence` | number | Producer-declared confidence in `[0, 1]`. |

A signal present in the list is a fact Pointmoon stands behind. A signal it cannot ground
is absent (or surfaced as silence in `fieldSnapshot`), never fabricated.

---

## `facts.fieldSnapshot`

A map of domain key to a per-domain reading object (e.g. `weather`, `air`, `light`,
`water`, `terrain`). Domains present depend on what could be grounded for the location.

Each domain reading carries the **provenance token fields**:

| field | type | description |
| --- | --- | --- |
| `source` | string | The provider that observed this domain's data. |
| `observedAt` | string (ISO 8601) | When the underlying observation was made. |
| `ttlMinutes` | number | Producer-declared freshness window: how many minutes the reading is considered current. |
| `confidence` | number | Producer-declared confidence in `[0, 1]`. |

Domain-specific measured fields (for example `temperatureC`, `windKph` under `weather`)
sit alongside the provenance fields on the same object. The set of measured fields varies
by domain and is additive over time; consumers should read fields by name and tolerate
unknown ones.

---

## Typed silence

Silence is a first-class shape, never an error and never a fabricated value. It can appear
per axis (inside a `fieldSnapshot` domain) when that specific domain cannot be grounded:

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

| field | type | description |
| --- | --- | --- |
| `silent` | boolean | `true` marks a typed-silence reading. |
| `reason` | string | Machine-readable reason for the silence (e.g. unknown, stale, low-confidence, out of range). |
| `confidence` | number | `0` for a silent axis. |

A whole-response silence (when nothing could be grounded for the location) is the same
typed shape at the top level: `{ "silent": true, "reason": ..., "meta": ... }`. Consumers
must handle silence as a normal, expected outcome.

---

## Freshness model

Freshness is **producer-declared**. Each reading states its own `ttlMinutes` alongside its
`observedAt`. A reading is considered current while `observedAt + ttlMinutes` is in the
future. Different domains and providers declare different TTLs; do not assume a single
global freshness. When a reading would be stale, Pointmoon returns typed silence for that
axis rather than serving the stale value.

---

## `notices`

An array of licensing and attribution notices for the sources that contributed to the
response. Each notice identifies a `source` and the attribution or license terms that
apply. Consumers that display or redistribute Pointmoon data are responsible for honoring
these notices.

---

## Season

Season is a field-truth reading, not a guess. On the `audience=facts` envelope, read
it from these three places — they agree:

- `facts.meta.season`
- `facts.fieldSnapshot.time.season`
- the `nature.season` signal in `facts.signals[]`

Do **not** read season from the legacy `axes` packet. `axes.time.calendar.season` is
not the facts-envelope token and can disagree with it.

Phenology (`facts.fieldSnapshot.phenology`, signals under `nature.phenology.*`) is a
separate domain: what is happening in the living year, not the calendar season token.
When seasonal expectation and the current field are not aligned,
`facts.fieldSnapshot.conflicts.seasonMismatch` is a typed conflict, not a second
season value.

Hemisphere, which token to trust, and how mismatch is declared are specified in the
engine season contract:
[`docs/SEASON_CONTRACT.md`](https://github.com/johangace/pointmoon/blob/main/docs/SEASON_CONTRACT.md).

---

## eBird bring-your-own key

eBird data is licensed for non-commercial use unless you have permission from the
Cornell Lab. On this public surface, bird observations from eBird are returned **only**
when the caller supplies their own key, making them the licensee.

- MCP: pass `ebirdApiKey` on `field_truth`.
- HTTP: send it as the `x-ebird-api-token` header. Never as a query parameter — it
  must stay out of URL logs. The hosted server and this connector never log the token.
- Omit the key and the eBird axis stays silent. That is typed silence, not an error.
- Free key: https://ebird.org/api/keygen

The licensing, header, and silence rules in full:
[`docs/EBIRD.md`](https://github.com/johangace/pointmoon/blob/main/docs/EBIRD.md).

---

## Teachable doorway

A teachable doorway is an engine reading contract: what Pointmoon selected as worth
noticing at a place (a species, a weather shift, a pattern). It is **not** a hosted
MCP tool.

As of this writing, `POST https://pointmoon.vercel.app/api/mcp` `tools/list` does not
advertise `teachable_doorways`. Do not call a tool by that name. Public agents use
`field_truth` and read the facts envelope. If a doorway tool ships later, the engine
doc and this paragraph will name it.

The doorway contract:
[`docs/TEACHABLE_DOORWAY.md`](https://github.com/johangace/pointmoon/blob/main/docs/TEACHABLE_DOORWAY.md).

---

## Stability

`field_truth` is read-only and idempotent. Measured fields and signal ids are additive;
new domains, new signals, and new notice kinds may appear over time. Consumers should read
fields by name, tolerate unknown keys, and always handle the typed-silence shape.
