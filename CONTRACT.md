# Pointmoon field-truth contract

This document describes the public response contract for Pointmoon field-truth: the
`audience=facts` shape returned by the hosted MCP `field_truth` tool and by
`GET /api/moon?audience=facts`. It is an interface-level description. It is not a
description of how Pointmoon computes any value.

The governing principle: **Pointmoon emits sourced observational tokens with provenance,
freshness, and confidence — or typed silence. It does not write prose, and it does not
guess.** Every field below is answerable to that.

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

## Stability

`field_truth` is read-only and idempotent. Measured fields and signal ids are additive;
new domains, new signals, and new notice kinds may appear over time. Consumers should read
fields by name, tolerate unknown keys, and always handle the typed-silence shape.
