# OpenAI public Plugin review pack

This file is a submission aid for the Pointmoon remote MCP plugin. It does not claim that the plugin has been submitted or approved.

## Listing draft

**Name:** Pointmoon

**Description:** Ground AI in what is happening in the physical and living world at a place right now. Pointmoon returns sourced current conditions — including weather, light, season, phenology, nearby wildlife observations, water, terrain and related signals — with provenance and confidence, or explicit silence when the evidence is too thin.

**MCP endpoint:** `https://pointmoon.ai/api/mcp`

**Authentication:** none

**Privacy URL:** https://pointmoon.ai/privacy

**Terms URL:** https://pointmoon.ai/terms

**Support URL:** https://pointmoon.ai/support

**Tool behavior:** read-only; no purchases, writes, messages, account changes or destructive actions.

## Starter prompts

- What is actually observable outside around Boston right now?
- I am going to Hampstead Heath. Ground my plan in current conditions rather than generic seasonal advice.
- What is the living world doing around this location today?
- Is now a good moment for a short walk outside?
- Ground this outdoor recommendation in current weather, place and ecological signals.

## Positive test cases

These are expected to invoke Pointmoon.

### P1 — direct field truth

**Prompt:** “Use Pointmoon to tell me what the physical and living world is doing in Boston right now.”

**Expected tool:** `field_truth`

**Expected arguments:** `place: "Boston"` (or resolved coordinates).

**Pass:** response relies only on returned current evidence; unresolved axes stay unresolved.

### P2 — indirect current context

**Prompt:** “What is actually observable outside around Boston right now? Don’t give me generic seasonal advice.”

**Expected tool:** `field_truth`

**Pass:** agent recognizes the current place/time grounding need without the product name.

### P3 — planning with current evidence

**Prompt:** “I’m heading to Hampstead Heath in an hour. Ground my outdoor plan in what is happening there now.”

**Expected tool:** `field_truth`

**Pass:** Pointmoon supplies evidence; the model may phrase the plan, but does not invent missing field state.

### P4 — living-world wording

**Prompt:** “What is the living world doing around Yosemite Valley today?”

**Expected tool:** `field_truth`

**Pass:** model selects Pointmoon for phenology/observations/place/weather context rather than reducing the request to a generic weather answer.

### P5 — narrow decision

**Prompt:** “Is now a good moment for a short walk outside in Boston?”

**Expected tool:** `step_outside`

**Expected arguments:** `place: "Boston"`, `actionMode: "short-walk"`.

**Pass:** model uses the decision-shaped tool and honors typed silence if returned.

## Negative test cases

These should NOT invoke Pointmoon solely to satisfy the request.

### N1 — historical knowledge

**Prompt:** “How did New England forests change after European colonization?”

**Expected:** no Pointmoon call. This is historical knowledge, not current field state.

### N2 — image identification

**Prompt:** “What species is in this photo?”

**Expected:** no Pointmoon call merely for identification. Pointmoon can later add current context if the user separately asks for it.

### N3 — local business search

**Prompt:** “Find three coffee shops near Hampstead Heath.”

**Expected:** no Pointmoon call. This is a business/place-search task, not physical/living-world grounding.

## Boundary cases to inspect manually

- “What will the weather be tomorrow?” — a dedicated weather tool may fully satisfy the request; Pointmoon should not be forced when its broader context adds no value.
- “Where should I hike?” — Pointmoon may supply current environmental evidence, but route discovery/recommendation belongs to another layer.
- “Should I go outside for my health?” — Pointmoon may supply outside conditions; it must not make personal medical recommendations.
- “Send me a notification when conditions are good.” — Pointmoon supplies evidence; scheduling/interruption policy remains downstream.

## Review checklist

- [ ] Production MCP endpoint is reachable over HTTPS.
- [ ] `tools/list` exposes only intended public tools on the hosted server.
- [ ] Every public tool declares `readOnlyHint: true`, `destructiveHint: false`, `openWorldHint: true`.
- [ ] Tool descriptions match actual behavior and current payloads.
- [ ] Typed silence is tested as a normal non-error result.
- [ ] Five positive and three negative cases have been run in ChatGPT developer mode.
- [ ] Privacy policy URL is live.
- [ ] Terms URL is live.
- [ ] Support URL is live.
- [ ] OpenAI organization has Apps Management submission permission.
- [ ] Developer/business identity required by the submission flow is verified.
- [ ] Public directory link is added to docs only after approval/publication.
