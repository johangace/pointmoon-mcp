// A well-formed `audience=facts` envelope, shared by both halves of the
// offline drill so that the ONLY thing that differs between the two stub sides
// is the divergence the drill is deliberately introducing.
//
// It is the real shape, trimmed: schemaVersion, the trust block (notices +
// provenance + sourced signals + the freshness quadruple on the weather
// reading) and one axis in typed silence.

export function goodEnvelope() {
  const observedAt = new Date().toISOString()
  return {
    schemaVersion: 'field-truth@1.1.0',
    audience: 'facts',
    notices: {
      attributionRequired: true,
      sources: [
        { source: 'open-meteo', license: 'CC BY 4.0', attribution: 'Weather data by Open-Meteo.com' },
      ],
    },
    provenance: {
      mode: 'live',
      providers: { weather: 'open-meteo', hydro: 'unresolved' },
    },
    facts: {
      signals: [
        { id: 'weather.temperature', label: 'Temperature', value: '18.7C', source: 'open-meteo', confidence: 0.9 },
      ],
      fieldSnapshot: {
        weather: {
          current: { source: 'open-meteo-forecast-model', observedAt, ttlMinutes: 90, temperatureC: 18.7 },
        },
        // Typed silence: an axis that could not be grounded, and says why.
        hydro: { provider: 'unresolved', resolutionStatus: 'unresolved', resolutionReason: 'timeout' },
      },
      timingWindows: [],
      meta: { adapterMode: 'live' },
    },
  }
}

/** The input schema both stub sides start from — the real one, as of today. */
export function goodInputSchema() {
  return {
    type: 'object',
    properties: {
      lat: { type: 'number', minimum: -90, maximum: 90 },
      lng: { type: 'number', minimum: -180, maximum: 180 },
      place: { type: 'string' },
      city: { type: 'string' },
      adapterMode: { type: 'string', enum: ['live', 'simulated', 'fixture'] },
      includeFieldSnapshot: { type: 'boolean' },
      ebirdApiKey: { type: 'string' },
    },
  }
}

export function goodTool(overrides = {}) {
  return {
    name: 'field_truth',
    title: 'Pointmoon Field Truth',
    description: 'Sourced field-truth for a coordinate.',
    inputSchema: goodInputSchema(),
    ...overrides,
  }
}
