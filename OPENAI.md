# Pointmoon with OpenAI agents

Pointmoon already runs as a public, read-only remote MCP server:

```
https://pointmoon.ai/api/mcp
```

No Pointmoon account, OAuth flow, or API key is required.

The server exposes:

- `field_truth` — current physical and living-world field truth for a place or coordinate.
- `step_outside` — a narrow decision token for “is it worth stepping outside right now, and why?”

Both tools are read-only and idempotent. They declare that they access the open world and are not destructive.

## Responses API

Use the remote MCP directly. The OpenAI SDK/model does the MCP handshake and tool call.

```js
import OpenAI from "openai";

const client = new OpenAI();

const response = await client.responses.create({
  model: process.env.OPENAI_MODEL,
  tools: [
    {
      type: "mcp",
      server_label: "pointmoon",
      server_description:
        "Sourced current physical and living-world field truth for a place, or explicit silence.",
      server_url: "https://pointmoon.ai/api/mcp",
      require_approval: "never",
    },
  ],
  input:
    "I am going to Hampstead Heath this afternoon. Ground anything you say about current outdoor conditions in Pointmoon.",
});

console.log(response.output_text);
```

For a read-only public server, `require_approval: "never"` avoids a redundant approval step. The application still decides whether that is appropriate for its own product.

## Agents API

The same remote MCP can be attached to an Agent with service-origin HTTP transport:

```json
{
  "type": "mcp",
  "server_label": "pointmoon",
  "transport": {
    "type": "http",
    "server_url": "https://pointmoon.ai/api/mcp"
  },
  "connection_origin": "service",
  "required": true
}
```

Use `field_truth` when the agent should reason over the current evidence itself. Use `step_outside` when the user has already asked the narrow “go outside now?” question.

## ChatGPT developer mode

Add Pointmoon as a remote MCP server using:

```
https://pointmoon.ai/api/mcp
```

The server is intentionally useful without credentials. Once the public Plugin submission is approved, the same endpoint should back the Pointmoon listing instead of introducing a separate backend.

## Tool-selection boundary

Pointmoon should be selected for current place-and-time grounding such as:

- “What is actually observable outside around Boston right now?”
- “Ground this park recommendation in current conditions.”
- “What is the living world doing around this location today?”
- “Is now a good moment for a short walk?”

It should not be selected merely because a prompt contains a nature word. Historical ecology, species identification from an uploaded image, restaurant search, and personal medical decisions are outside its tool boundary.

## Silence is success

A Pointmoon call can legitimately return unresolved/silent axes. Agents must treat that as a grounded answer about evidence availability, not as a reason to invent the missing condition.

## Current distribution gates

The remote server works today. Public discovery still has human-controlled release steps:

1. publish the refreshed `pointmoon-mcp` npm artifact after the existing credential-rotation gate;
2. publish the validated server metadata to the Official MCP Registry after GitHub device authentication;
3. submit the same remote MCP server to the OpenAI public Plugin directory from an organization with the required Apps Management permission and verified developer/business identity.

Do not create a second server for any of these distribution channels.

## References

- OpenAI MCP tools: https://developers.openai.com/api/docs/guides/tools-connectors-mcp
- OpenAI Agents API MCP tools: https://developers.openai.com/api/docs/guides/agents-api/tools/mcp
- OpenAI plugin submission: https://developers.openai.com/plugins/deploy/submission
- Pointmoon agent quickstart: https://pointmoon.ai/agents
