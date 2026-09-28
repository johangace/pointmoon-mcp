# Mapbox × Pointmoon: a two-MCP location + living-world proof

This example connects Mapbox's hosted Location AI MCP and Pointmoon's hosted MCP in the same agent.

The product boundary is intentional:

- **Mapbox:** where is it, what is nearby, how do I get through it, what is the geometry?
- **Pointmoon:** what current physical and living-world evidence can be supported there?

Pointmoon is not a routing layer. Mapbox is not being used as Pointmoon's environmental evidence store.

## 1. Connect both servers

The ready-to-copy config is [mcp.json](./mcp.json).

Mapbox's hosted MCP uses browser OAuth on first connection. Pointmoon is a public read-only MCP and does not require authentication.

For Claude Code:

```bash
claude mcp add --transport http mapbox https://mcp.mapbox.com/mcp
claude mcp add --transport http pointmoon https://pointmoon.ai/api/mcp
```

For Codex:

```bash
codex mcp add mapbox --url https://mcp.mapbox.com/mcp
codex mcp add pointmoon --url https://pointmoon.ai/api/mcp
```

Then use [PROMPT.md](./PROMPT.md) as the orchestration instructions and run its primary test prompt.

## 2. What the proof should do

A route question should look roughly like:

```text
place / route request
        |
        v
 Mapbox MCP
 resolve + route + geometry
        |
        +---- choose <=4 representative coordinates
        |
        v
 Pointmoon MCP
 field_truth at sampled coordinates
        |
        v
 agent composes answer
        |
        +---- Mapbox route/search facts
        +---- Pointmoon sourced living-world facts
        +---- explicit silence where Pointmoon cannot support a claim
        |
        v
 Mapbox render_map_tool
 route + selected Pointmoon evidence markers
```

`render_map_tool` accepts hand-composed GeoJSON, so Pointmoon does not need a new map renderer for this proof.

## 3. Why the sample count is bounded

Pointmoon is field truth, not a per-vertex enrichment API. Start with the route start/end and at most two spatially separated interior points. A later implementation can choose samples from distance, habitat boundaries, or durable Points, but the proof should not fan out across every coordinate in a route geometry.

## 4. Data handling boundary

Mapbox documents Search Box results for temporary use. This example therefore composes Mapbox output and Pointmoon output during the live agent turn and does **not** write Mapbox POI/search results into Pointmoon.

Pointmoon facts keep their own source/freshness/confidence envelope. A model may phrase them, but missing Pointmoon evidence must not be converted into an environmental fact.

## 5. What to compare

Run three answers for the same prompt:

1. Mapbox only.
2. Pointmoon only.
3. Both MCPs using [PROMPT.md](./PROMPT.md).

Record:
- route/place usefulness;
- living-world specificity;
- unsupported claims;
- Pointmoon calls made;
- latency;
- whether provenance remains distinguishable;
- whether the answer still behaves correctly when one Pointmoon axis is silent.

The goal is not "more tools". The goal is a clean proof that spatial infrastructure plus living-world field truth produces an agent capability neither server provides alone.

## Sources

- Mapbox MCP server: https://docs.mapbox.com/location-ai/mcp-servers/mcp-server/
- Mapbox Location AI MCP overview: https://docs.mapbox.com/location-ai/mcp-servers/
- Mapbox co-build program: https://www.mapbox.com/location-ai/build
- Pointmoon contract: ../../CONTRACT.md
