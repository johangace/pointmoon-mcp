// The comparator. Pure functions, no network, no process — so the negative
// control in `conformance/drill.mjs` can feed it deliberately-broken input and
// prove it bites without touching the internet.
//
// Every divergence it reports NAMES THE FIELD and says which side it appeared
// on. "Expected true, got false" is not a drift report; it is a shrug. A
// conformance job that cannot tell you *what* moved sends you reading two
// JSON blobs by eye, which is the job it was supposed to do for you.

/** Two labels used everywhere, so a report never leaves you guessing the side. */
export const PUBLISHED = 'published npm artifact'
export const HOSTED = 'hosted server'

/**
 * Connector-only tools that the hosted `/api/mcp` deliberately does NOT
 * advertise. Both are documented in the connector as internal/legacy debug
 * shims implemented over plain HTTP endpoints (`/api/moon`,
 * `/api/decision-seam`), not as MCP tools of the hosted server. Their absence
 * from `tools/list` is by design, so they are reported as notes.
 *
 * Anything else that exists on only one side is drift.
 */
export const KNOWN_CONNECTOR_ONLY_TOOLS = new Set(['moon_packet', 'decision_seam'])

/** `{ severity: 'drift' | 'note', field, message }` */
function drift(field, message) {
  return { severity: 'drift', field, message }
}
function note(field, message) {
  return { severity: 'note', field, message }
}

function keysOf(object) {
  return object && typeof object === 'object' ? Object.keys(object) : []
}

/** Symmetric difference of two key lists, kept ordered for stable output. */
function setDiff(a, b) {
  const bSet = new Set(b)
  const aSet = new Set(a)
  return {
    onlyA: a.filter((k) => !bSet.has(k)),
    onlyB: b.filter((k) => !aSet.has(k)),
  }
}

/**
 * Compare the tool surface the published connector advertises against the tool
 * surface the hosted server advertises.
 *
 * `published` and `hosted` are both `tools/list` results (arrays of tools).
 */
export function compareToolSurface(published, hosted, { toolName = 'field_truth' } = {}) {
  const found = []

  const publishedNames = (published ?? []).map((t) => t?.name).filter(Boolean)
  const hostedNames = (hosted ?? []).map((t) => t?.name).filter(Boolean)

  // 1. The tool name itself.
  const publishedTool = (published ?? []).find((t) => t?.name === toolName)
  const hostedTool = (hosted ?? []).find((t) => t?.name === toolName)

  if (!publishedTool) {
    found.push(
      drift(
        `tool:${toolName}`,
        `tool \`${toolName}\` is MISSING from the ${PUBLISHED}. It advertises: ` +
          `${publishedNames.join(', ') || '(no tools at all)'}.`
      )
    )
  }
  if (!hostedTool) {
    found.push(
      drift(
        `tool:${toolName}`,
        `tool \`${toolName}\` is MISSING from the ${HOSTED}. It advertises: ` +
          `${hostedNames.join(', ') || '(no tools at all)'}.`
      )
    )
  }

  // 2. Every other tool, in both directions.
  const toolDiff = setDiff(publishedNames, hostedNames)
  for (const name of toolDiff.onlyB) {
    found.push(
      drift(
        `tool:${name}`,
        `tool \`${name}\` is advertised by the ${HOSTED} but is ABSENT from the ${PUBLISHED}. ` +
          `A stranger who installed the package cannot call it — the artifact is behind the server.`
      )
    )
  }
  for (const name of toolDiff.onlyA) {
    if (name === toolName) continue
    const message =
      `tool \`${name}\` is advertised by the ${PUBLISHED} but not by the ${HOSTED}'s tools/list.`
    if (KNOWN_CONNECTOR_ONLY_TOOLS.has(name)) {
      found.push(
        note(`tool:${name}`, `${message} Known connector-only legacy/debug shim — expected.`)
      )
    } else {
      found.push(
        drift(
          `tool:${name}`,
          `${message} It is not on the known connector-only list, so either the server dropped it ` +
            `or the package invented it.`
        )
      )
    }
  }

  if (!publishedTool || !hostedTool) return found

  // 3. The FULL input-schema property set, named property by named property.
  const publishedProps = keysOf(publishedTool.inputSchema?.properties)
  const hostedProps = keysOf(hostedTool.inputSchema?.properties)
  const propDiff = setDiff(publishedProps, hostedProps)

  for (const prop of propDiff.onlyB) {
    found.push(
      drift(
        `${toolName}.inputSchema.properties.${prop}`,
        `input property \`${prop}\` APPEARED on the ${HOSTED} and is ABSENT from the ${PUBLISHED}. ` +
          `Callers of the installed package cannot pass \`${prop}\`.\n` +
          `      ${PUBLISHED} (${publishedProps.length}): ${publishedProps.join(', ')}\n` +
          `      ${HOSTED} (${hostedProps.length}): ${hostedProps.join(', ')}`
      )
    )
  }
  for (const prop of propDiff.onlyA) {
    found.push(
      drift(
        `${toolName}.inputSchema.properties.${prop}`,
        `input property \`${prop}\` is advertised by the ${PUBLISHED} but DISAPPEARED from the ` +
          `${HOSTED}. Callers of the installed package will send an argument the server no longer ` +
          `understands.\n` +
          `      ${PUBLISHED} (${publishedProps.length}): ${publishedProps.join(', ')}\n` +
          `      ${HOSTED} (${hostedProps.length}): ${hostedProps.join(', ')}`
      )
    )
  }

  // 4. Shared properties: type and enum. Descriptions are prose and are
  //    reported separately as notes (see below) — they move for editorial
  //    reasons and should not turn the build red on their own.
  for (const prop of publishedProps.filter((p) => hostedProps.includes(p))) {
    const p = publishedTool.inputSchema.properties[prop] ?? {}
    const h = hostedTool.inputSchema.properties[prop] ?? {}

    if (p.type !== h.type) {
      found.push(
        drift(
          `${toolName}.inputSchema.properties.${prop}.type`,
          `input property \`${prop}\` changed type: ${PUBLISHED} says \`${p.type}\`, ` +
            `${HOSTED} says \`${h.type}\`.`
        )
      )
    }

    const pEnum = Array.isArray(p.enum) ? p.enum : null
    const hEnum = Array.isArray(h.enum) ? h.enum : null
    if (pEnum || hEnum) {
      const enumDiff = setDiff(pEnum ?? [], hEnum ?? [])
      for (const value of enumDiff.onlyB) {
        found.push(
          drift(
            `${toolName}.inputSchema.properties.${prop}.enum`,
            `enum value \`${value}\` for \`${prop}\` APPEARED on the ${HOSTED} and is ABSENT ` +
              `from the ${PUBLISHED} (published: [${(pEnum ?? []).join(', ')}], ` +
              `hosted: [${(hEnum ?? []).join(', ')}]).`
          )
        )
      }
      for (const value of enumDiff.onlyA) {
        found.push(
          drift(
            `${toolName}.inputSchema.properties.${prop}.enum`,
            `enum value \`${value}\` for \`${prop}\` DISAPPEARED from the ${HOSTED} but is still ` +
              `offered by the ${PUBLISHED} (published: [${(pEnum ?? []).join(', ')}], ` +
              `hosted: [${(hEnum ?? []).join(', ')}]).`
          )
        )
      }
    }

    if (typeof p.description === 'string' && typeof h.description === 'string') {
      if (p.description !== h.description) {
        found.push(
          note(
            `${toolName}.inputSchema.properties.${prop}.description`,
            `description for \`${prop}\` differs (prose, not shape — not a build failure).\n` +
              `      ${PUBLISHED}: ${p.description}\n` +
              `      ${HOSTED}: ${h.description}`
          )
        )
      }
    }
  }

  // 5. `required`. Absent and empty mean the same thing; only a real change counts.
  const publishedRequired = publishedTool.inputSchema?.required ?? []
  const hostedRequired = hostedTool.inputSchema?.required ?? []
  const reqDiff = setDiff(publishedRequired, hostedRequired)
  for (const prop of reqDiff.onlyB) {
    found.push(
      drift(
        `${toolName}.inputSchema.required`,
        `\`${prop}\` is now REQUIRED by the ${HOSTED} but is optional in the ${PUBLISHED} ` +
          `(published required: [${publishedRequired.join(', ')}], ` +
          `hosted required: [${hostedRequired.join(', ')}]).`
      )
    )
  }
  for (const prop of reqDiff.onlyA) {
    found.push(
      drift(
        `${toolName}.inputSchema.required`,
        `\`${prop}\` is REQUIRED by the ${PUBLISHED} but is optional on the ${HOSTED} ` +
          `(published required: [${publishedRequired.join(', ')}], ` +
          `hosted required: [${hostedRequired.join(', ')}]).`
      )
    )
  }

  // 6. The tool description is the agent-facing contract. It is prose, so a
  //    difference is a loud note rather than a failure — but it is never
  //    swallowed.
  if (publishedTool.description !== hostedTool.description) {
    found.push(
      note(
        `${toolName}.description`,
        `the tool description differs between the ${PUBLISHED} and the ${HOSTED}. ` +
          `Agents choose tools by this text, so a republish is warranted even though this alone ` +
          `does not fail the build.\n` +
          `      ${PUBLISHED}: ${String(publishedTool.description).slice(0, 240)}\n` +
          `      ${HOSTED}: ${String(hostedTool.description).slice(0, 240)}`
      )
    )
  }

  return found
}

/**
 * Compare the shape of one live `field_truth` envelope fetched through the
 * published connector against one fetched straight from the hosted server.
 *
 * Only SHAPE is compared. Values are live field-truth and legitimately differ
 * between two calls seconds apart (an upstream source that timed out on one
 * call resolves on the next), so comparing them would produce a flaky red —
 * and a flaky detector gets ignored, which is the same failure as one that
 * cannot go red at all.
 */
export function compareEnvelopes(published, hosted) {
  const found = []

  const compareKeys = (path, a, b) => {
    const aKeys = keysOf(a)
    const bKeys = keysOf(b)
    const diff = setDiff(aKeys, bKeys)
    for (const key of diff.onlyB) {
      found.push(
        drift(
          `${path}.${key}`,
          `\`${path}.${key}\` APPEARED in the ${HOSTED} response and is ABSENT from the response ` +
            `the ${PUBLISHED} returns.\n` +
            `      ${PUBLISHED} (${aKeys.length}): ${aKeys.join(', ')}\n` +
            `      ${HOSTED} (${bKeys.length}): ${bKeys.join(', ')}`
        )
      )
    }
    for (const key of diff.onlyA) {
      found.push(
        drift(
          `${path}.${key}`,
          `\`${path}.${key}\` is returned via the ${PUBLISHED} but DISAPPEARED from the ${HOSTED} ` +
            `response.\n` +
            `      ${PUBLISHED} (${aKeys.length}): ${aKeys.join(', ')}\n` +
            `      ${HOSTED} (${bKeys.length}): ${bKeys.join(', ')}`
        )
      )
    }
  }

  if (published?.schemaVersion !== hosted?.schemaVersion) {
    found.push(
      drift(
        'schemaVersion',
        `\`schemaVersion\` diverged: the ${PUBLISHED} received ` +
          `\`${published?.schemaVersion}\`, the ${HOSTED} served \`${hosted?.schemaVersion}\`.`
      )
    )
  }

  compareKeys('(envelope)', published, hosted)
  compareKeys('facts', published?.facts, hosted?.facts)
  compareKeys('facts.fieldSnapshot', published?.facts?.fieldSnapshot, hosted?.facts?.fieldSnapshot)

  return found
}

/**
 * The trust block: what makes a Pointmoon claim checkable rather than merely
 * asserted. `notices` (who licensed the data), `provenance` (which providers
 * answered), a `source` and `confidence` on every signal, and the freshness
 * quadruple on at least one domain reading.
 */
export function checkTrustBlocks(envelope, side) {
  const found = []

  const sources = envelope?.notices?.sources
  if (!Array.isArray(sources) || sources.length === 0) {
    found.push(
      drift(
        'notices.sources',
        `${side}: the trust block is missing — \`notices.sources[]\` is ` +
          `${Array.isArray(sources) ? 'empty' : typeof sources}. Claims arrived with no ` +
          `licensing or attribution behind them.`
      )
    )
  } else {
    const unnamed = sources.filter((s) => !s?.source)
    if (unnamed.length > 0) {
      found.push(
        drift(
          'notices.sources[].source',
          `${side}: ${unnamed.length} of ${sources.length} entries in \`notices.sources[]\` ` +
            `carry no \`source\` name.`
        )
      )
    }
  }

  const providers = envelope?.provenance?.providers
  if (!providers || typeof providers !== 'object') {
    found.push(
      drift(
        'provenance.providers',
        `${side}: the trust block is missing — \`provenance.providers\` is ` +
          `${providers === undefined ? 'absent' : typeof providers}. Nothing says which provider ` +
          `answered for which axis.`
      )
    )
  }

  const signals = envelope?.facts?.signals
  if (!Array.isArray(signals) || signals.length === 0) {
    found.push(
      drift(
        'facts.signals',
        `${side}: \`facts.signals[]\` is ${Array.isArray(signals) ? 'empty' : typeof signals}. ` +
          `Pointmoon returned no claims at all.`
      )
    )
  } else {
    const unsourced = signals.filter((s) => !s?.source)
    if (unsourced.length > 0) {
      found.push(
        drift(
          'facts.signals[].source',
          `${side}: ${unsourced.length} of ${signals.length} signals carry no \`source\` ` +
            `(first offender: \`${unsourced[0]?.id ?? '(no id)'}\`). Every claim must be sourced.`
        )
      )
    }
    const unconfident = signals.filter((s) => typeof s?.confidence !== 'number')
    if (unconfident.length > 0) {
      found.push(
        drift(
          'facts.signals[].confidence',
          `${side}: ${unconfident.length} of ${signals.length} signals carry no numeric ` +
            `\`confidence\` (first offender: \`${unconfident[0]?.id ?? '(no id)'}\`).`
        )
      )
    }
  }

  // The freshness quadruple has to be real somewhere, not just documented.
  const weather = envelope?.facts?.fieldSnapshot?.weather?.current
  if (weather && typeof weather === 'object') {
    for (const field of ['source', 'observedAt', 'ttlMinutes']) {
      if (weather[field] === undefined || weather[field] === null) {
        found.push(
          drift(
            `facts.fieldSnapshot.weather.current.${field}`,
            `${side}: the weather reading carries no \`${field}\`. A reading without its ` +
              `freshness envelope cannot be checked for staleness.`
          )
        )
      }
    }
  } else {
    found.push(
      note(
        'facts.fieldSnapshot.weather.current',
        `${side}: no weather reading in this response, so the freshness quadruple could not be ` +
          `checked on it.`
      )
    )
  }

  return found
}

/**
 * The silence contract: an axis Pointmoon cannot ground says so, with a
 * reason. It never carries a plausible-looking value while claiming to be
 * unresolved, and it is never silently dropped.
 *
 * Silence is not required to be present (a fully-grounded location is a
 * legitimate answer), but wherever it IS present it must be well-formed.
 */
export function checkSilenceContract(envelope, side) {
  const found = []
  const snapshot = envelope?.facts?.fieldSnapshot

  if (!snapshot || typeof snapshot !== 'object') {
    found.push(
      drift(
        'facts.fieldSnapshot',
        `${side}: \`facts.fieldSnapshot\` is ${snapshot === undefined ? 'absent' : typeof snapshot}. ` +
          `The silence contract lives per axis inside it; without it there is nowhere for an ` +
          `ungrounded axis to declare itself.`
      )
    )
    return found
  }

  for (const [axis, reading] of Object.entries(snapshot)) {
    if (!reading || typeof reading !== 'object') continue

    if (reading.silent === true) {
      if (typeof reading.reason !== 'string' || reading.reason.length === 0) {
        found.push(
          drift(
            `facts.fieldSnapshot.${axis}.reason`,
            `${side}: axis \`${axis}\` is marked \`silent: true\` but gives no \`reason\`. ` +
              `Untyped silence is indistinguishable from a bug.`
          )
        )
      }
      continue
    }

    const unresolved =
      reading.resolutionStatus === 'unresolved' || reading.provider === 'unresolved'
    if (unresolved) {
      if (typeof reading.resolutionReason !== 'string' || reading.resolutionReason.length === 0) {
        found.push(
          drift(
            `facts.fieldSnapshot.${axis}.resolutionReason`,
            `${side}: axis \`${axis}\` is \`unresolved\` but gives no \`resolutionReason\`. ` +
              `Untyped silence is indistinguishable from a bug.`
          )
        )
      }
    }
  }

  return found
}

/** Render a divergence list. Drifts first, because they are what fails the build. */
export function formatReport(divergences) {
  const drifts = divergences.filter((d) => d.severity === 'drift')
  const notes = divergences.filter((d) => d.severity === 'note')
  const lines = []

  for (const d of drifts) lines.push(`  DRIFT  ${d.field}\n         ${d.message}`)
  for (const d of notes) lines.push(`  note   ${d.field}\n         ${d.message}`)

  return lines.join('\n')
}
