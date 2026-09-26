# Make content respond to the world outside

Two uses of the same small example: select existing content from environmental
context, and display that content with its source and reading time. There is no
Pointmoon engine code, AI-generated copy or hardware setup here.

## Run it

Node 18+; no packages to install. From the repository root:

```bash
# Offline first: clearly labelled synthetic data changes every minute.
node examples/world-responsive/server.mjs --demo

# Or read the hosted API for the fixed example location (Boston).
node examples/world-responsive/server.mjs
```

Open `http://127.0.0.1:4311`. The page refreshes every minute. To use another port,
set `PORT=4312`. Stop with Ctrl-C.

Live mode honours `POINTMOON_BASE_URL` and the optional server-side
`POINTMOON_API_KEY`. Use a key only with a service that has provisioned it. This
example does not create an account, grant commercial rights, or promise that
paid onboarding is already available. Hosted access is governed by Pointmoon's
published service terms separately from this repository's code licence.

## Adapt it

`context.mjs` reads the existing public HTTP response at
`facts.fieldSnapshot.weather.current`. It requires a source, numeric temperature,
reading time and an unexpired producer-declared TTL before using weather to
select content. Missing, future, stale or malformed readings produce the regular
card, never an invented condition. Source notices are preserved and displayed.

`DEMO_CARDS` contains deliberately ordinary cafe content. Its thresholds are
**application-authored choices, not Pointmoon recommendations**. Replace the array
or pass your own to `selectCard(context, cards)`:

```js
const cards = [{
  id: 'my-collection', title: 'My collection', text: 'My own content.',
  matches: (context) => context.weather.temperatureC >= 20,
  evidencePaths: ['facts.fieldSnapshot.weather.current.temperatureC'],
}]
const chosen = selectCard(context, cards)
```

An extension is just a pure function in your application. It keeps its own
selection/output separate from Pointmoon's evidence; it does not overwrite the
source's confidence, timestamps or missing-data states. Nothing is uploaded to
run inside Pointmoon. Each selector can declare its own `evidencePaths`; when
dependencies are not declared, that metadata is omitted rather than guessed.

The live example uses a fixed public coordinate. Change `lat` and `lng` when
calling `createDisplayServer` to use your own intended location. Do not publish
private locations in examples or commit them as test fixtures.

## Boundaries

This is a **local developer demonstration**, not a production reverse proxy.
The CLI binds to loopback; the exported server also verifies both local and
remote socket addresses, so accidentally binding it broadly does not admit remote
requests. It accepts only `/`, checks the Host header, and coalesces
requests. Live fetches are cached for at most a minute and the source freshness
is checked on every render. It does not accept arbitrary user-provided locations
or remote URLs. The API key stays in server memory and is never sent to the page.

Before hosting your own display publicly, add deployment-specific access and
rate controls, a secrets manager, HTTPS, monitoring and a privacy review. Precise
coordinates still travel to Pointmoon in the existing GET request; this example
does not claim that HTTP GET avoids URL logging.

Source context can be forecast/model-derived. It is not proof of an exact site's
conditions, and the cafe selection is not a safety or agricultural decision.
Read and honour returned source notices for your own use and presentation.

## Tests and smoke check

```bash
node --test examples/world-responsive/context.test.mjs
node examples/05-world-responsive.mjs
```

The test suite is offline with explicitly synthetic inputs and mocked upstream
requests. It checks missing/stale data, the extension boundary, HTML escaping,
credential handling, local-server behavior and request coalescing. The one-shot
smoke example calls the real hosted API and checks its sourced-signal envelope.
`examples/run-all.mjs` runs both without starting a persistent display server.
