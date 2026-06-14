https://www.loom.com/share/0a0be45701d74a7490ad9c6a8c4ebc4f


# Wayfair × Subconscious Hackathon Starter

**Repository (canonical):** [github.com/rohannagpure45/hack-cloudflare-workers-starter](https://github.com/rohannagpure45/hack-cloudflare-workers-starter)

Clone and work from the **repository root** (this folder). There is no nested `hack-cloudflare-workers-starter/` directory — if you see one, delete it and re-clone.

```bash
git clone https://github.com/rohannagpure45/hack-cloudflare-workers-starter.git
cd hack-cloudflare-workers-starter
./scripts/verify-git-remote.sh   # confirms origin before you push
```

Build an AI agent on **Cloudflare Workers** powered by the [Subconscious API](https://docs.subconscious.dev).

This repo gives you all four pieces wired together — so you can focus on the problem, not the plumbing.

---

## Hackathon build: Freight Rate Spot Market Negotiator

This project is focused on the **Supplier / Procurement Ops** track: autonomous freight lane recovery when a primary carrier drops a route.

### Problem

When a carrier drops a shipping lane or hits a severe delay, Wayfair's supply chain ops team has to enter the freight spot market manually. In practice, that means urgent emails and calls with 3PL freight brokers asking who can move the shipment, when they can pick it up, and what rate they will charge. The delay costs time, margin, and operational focus.

### Agent workflow

1. **Trigger:** a mock telemetry webhook reports a dropped route from a North Carolina supplier to a New Jersey fulfillment center.
2. **Cloudflare Worker:** `POST /webhook/dropped-lane` receives the event, logs it, returns quickly to the sender, and starts the lane recovery flow.
3. **Baseten baseline:** the agent calls a Baseten-hosted model or sprint-safe mock endpoint to estimate the fair-market lane price, for example `$1,350`.
4. **3PL quote tools:** the agent calls mock provider APIs such as XPO and Coyote to fetch spot-market quotes and transit windows.
5. **Subconscious reasoning:** the agent compares total rate, percent over baseline, transit hours, and reliability constraints, then drafts a counter-offer or chooses the best viable carrier.
6. **Slack App output:** there is no separate UI for the hackathon demo. The operator-facing surface is a Slack App message sent through an incoming webhook or mocked Slack webhook endpoint.
7. **HITL guardrail:** if the negotiated rate is within 10% of baseline, the agent can book automatically. If the best available rate is materially above baseline, it sends a Slack approval message.
8. **Resolution:** Slack approve/reject callbacks tell the Worker to finalize or reject the booking.

### Why it wins

The demo should show a procurement exception moving from route-drop telemetry to negotiated recovery in seconds instead of roughly three hours of manual email back-and-forth. It uses all three sponsor systems in a way that maps cleanly to the real enterprise workflow:

| Sponsor/tool | Demo role |
|--------------|-----------|
| Cloudflare Workers | Edge webhook, fast orchestration, Slack approval callback, mock logistics APIs, visible execution logs. |
| Baseten | Fair-market pricing model or simulated model call used as the negotiation baseline. |
| Subconscious API | Negotiator agent that evaluates quotes, reasons about trade-offs, counters, and escalates when needed. |

### Human-in-the-loop rule

Do not let the agent spend without limits.

| Condition | Agent action |
|-----------|--------------|
| Negotiated rate is within 10% of historical or predicted baseline | Book automatically and log the decision. |
| Best viable rate is around 20% or more over baseline | Request manager approval before booking. |
| No carrier can meet the delivery window | Escalate with quote details and recommended fallback. |

Slack approval payloads should include the lane, carrier, quoted rate, baseline, percent over baseline, delivery commitment, and approve/reject actions.

### Demo output: Slack App webhook

Do not build a standalone dashboard UI for the primary demo path. The visible output should be a Slack App message that acts as the logistics manager's command center.

The Slack message should be sent through a Slack incoming webhook in production-style demos, with a local/mock webhook acceptable during development. It should include:

- Dropped lane summary, for example `NC supplier -> NJ fulfillment center`.
- Best carrier recommendation and negotiated spot rate.
- Baseten fair-market baseline and percent over baseline.
- Delivery guarantee or estimated transit window.
- Agent rationale in one concise sentence.
- `Approve` and `Reject` actions that call back into the Cloudflare Worker.

This keeps the workflow enterprise-realistic: Cloudflare handles the event and callback, Baseten supplies the pricing baseline, Subconscious negotiates, and Slack is the human-in-the-loop approval surface.

### 60-second demo structure

| Time | Beat |
|------|------|
| 0:00-0:10 | State the problem: dropped freight lanes create urgent spot-market procurement work. |
| 0:10-0:25 | Trigger the dropped route and show Cloudflare Worker logs catching the webhook. |
| 0:25-0:40 | Show Baseten returning a baseline and Subconscious comparing mock 3PL quotes. |
| 0:40-0:50 | Show the Slack App HITL message when rates exceed the spend threshold. |
| 0:50-1:00 | Finalize the booking and summarize the savings in time and margin. |

---

## Anatomy of an agent

Every agent is four parts:

| Part | Role | In this starter |
|------|------|-----------------|
| **Trigger** | Wakes the agent up | Webhook, cron, API call, or dashboard button |
| **Harness** | Runs the loop — receives input, calls the LLM, executes tools, returns output | Cloudflare Worker (`src/agent/loop.ts`) |
| **LLM** | The brain — reasons and decides what to do next | [Subconscious API](https://docs.subconscious.dev) |
| **Tools** | The hands — fetch data, search catalogs, call APIs | `src/agent/tools.ts` (you add these) |

```
  Trigger          Harness (Worker)              LLM              Tools
  ───────          ────────────────              ───              ─────
  webhook    ──→   receive event
  cron       ──→   build prompt           ──→   Subconscious  ←──  search_catalog
  API/button ──→   run ReAct loop         ←──   "call tool X" ──→  log_note
                   return answer
```

**What is a Cloudflare Worker?** It's where the **harness** runs — serverless TypeScript on Cloudflare's network. No servers to provision. You edit prompts and tools, run `npm run dev`, deploy with one command.

You don't need prior Cloudflare experience to hack on this repo.

---

## Pick a track

### Track 1 — Consumer Shopping Experience

Millions of customers visit Wayfair every day to buy furniture. How can AI agents improve discovery and the buyer experience?

**Challenge:** Build an agent that improves the consumer discovery and shopping experience for furniture.

**Starter ideas:**
- Style matcher — user describes a room → agent recommends furniture categories and search terms
- Compare assistant — agent helps narrow down similar products by dimensions, material, and reviews
- Discovery bot — cron or webhook ingests new catalog data → agent flags trending items or gaps

**Good triggers:** `POST /api/run` (user query), dashboard button (demo), webhook (product events)

---

### Track 2 — Supply Chain

Hundreds of thousands of furniture pieces ship worldwide through Wayfair and its supplier network. How can AI agents help manage this complexity?

**Challenge:** Build an agent that improves Wayfair's ability to manage its supply chain.

**Starter ideas:**
- Freight spot-market negotiator — webhook on dropped carrier lane → agent fetches 3PL quotes, compares against Baseten fair-market baseline, negotiates, and books or escalates
- Delay triage — webhook on shipment exception → agent summarizes impact and suggests next steps
- Supplier monitor — cron checks status feeds → agent logs anomalies and priorities
- Route advisor — agent uses tools to compare options and recommend reroutes or escalations

**Good triggers:** webhook (shipment/supplier events), cron (scheduled checks), `POST /api/run` (ops query)

---

### Track 3 — FinOps & Customer Service

Wayfair manages ~$12B in revenue and serves ~22M customers per year. How can agentic systems improve financial operations and customer service?

**Challenge:** Build an agent system that improves internal operations: financial operations or customer service.

**Starter ideas:**
- Ticket router — webhook on support ticket → agent classifies, summarizes, and routes
- Refund analyst — agent reviews case details via tools and drafts a recommendation
- Ops digest — cron runs daily → agent summarizes open issues, spend anomalies, or SLA risks

**Good triggers:** webhook (tickets, payments), cron (daily digest), `POST /api/run` (analyst query)

---

## Get started

**Prerequisites:** Node.js 20+, a [Subconscious API key](https://www.subconscious.dev/platform)

```bash
# 1. Install
npm install

# 2. Configure secrets
cp .dev.vars.example .dev.vars
# Add SUBCONSCIOUS_API_KEY to .dev.vars

# 3. Create KV storage (agent config + run history)
npx wrangler kv namespace create AGENT_KV
npx wrangler kv namespace create AGENT_KV --preview
# Paste both IDs into wrangler.toml

# 4. Run
npm run dev
```

Open **http://localhost:8787** — edit your agent's prompts, pick tools, and hit **Run now**.

**Deploy:**

```bash
npm run deploy
npx wrangler secret put SUBCONSCIOUS_API_KEY
```

---

## How it works

Same **ReAct loop** as [hack-cli-starter](https://github.com/subconscious-systems/subconscious/tree/main/examples/hack-cli-starter): the harness asks the LLM what to do, runs tools when asked, and loops until done.

| Part | What happens | Where in code |
|------|----------------|---------------|
| **Trigger** | Something fires the agent | `src/index.ts` — routes, cron, webhooks |
| **Harness** | Manages the loop, config, run history | `src/agent/loop.ts`, `src/agent/store.ts` |
| **LLM** | Reasons and returns `tool_call` or `final_answer` | `src/subconscious/client.ts` → Subconscious |
| **Tools** | Execute locally when the LLM asks | `src/agent/tools.ts` |

---

## Example: Shopping assistant (Track 1)

Ready-made example for the consumer shopping track:

```bash
npm run dev

# In another terminal:
bash examples/shopping-assistant/run.sh
```

See [examples/shopping-assistant/README.md](./examples/shopping-assistant/README.md) for the full walkthrough.

**Want a terminal REPL first?** Prototype locally with [hack-cli-starter](https://github.com/subconscious-systems/subconscious/tree/main/examples/hack-cli-starter) — then port your tools and prompts here for webhooks, cron, and deployment.

```bash
git clone https://github.com/subconscious-systems/subconscious
cd subconscious/examples/hack-cli-starter
npm install && npm run build && npm link
export SUBCONSCIOUS_API_KEY=your_key
sub
```

| Starter | Best for |
|---------|----------|
| **This repo** (Workers) | Triggers, webhooks, cron, dashboard, deploy to edge |
| **[hack-cli-starter](https://github.com/subconscious-systems/subconscious/tree/main/examples/hack-cli-starter)** | Fast local iteration, terminal chat, MCP tools |

---

## Build your agent

Work through the four parts:

For this hackathon build, prioritize these pieces in order:

1. `POST /webhook/dropped-lane` for the telemetry trigger.
2. Mock 3PL quote tools for XPO and Coyote with price plus transit hours.
3. Baseten baseline price tool, real if available and simulated if needed.
4. Subconscious prompt and tool definitions for quote comparison, counter-offer drafting, and booking decisions.
5. Slack App webhook message for the operator-facing output.
6. HITL approval callback for above-threshold spend.

### Mock 3PL environment

Run the local Express server in a separate terminal when developing the freight quote tools:

```bash
npm run mock:3pl
```

Use deterministic demo scenarios when recording:

```bash
# Best quote is under $1,500, so the agent recommends autonomous booking.
npm run mock:3pl:auto

# All quotes are over $1,500, so the agent calls request_human_approval.
npm run mock:3pl:hitl
```

It exposes two dummy freight broker endpoints:

```bash
curl -s -X POST http://localhost:3000/api/3pl/xpo \
  -H "Content-Type: application/json" \
  -d '{ "origin": "27513", "destination": "07001" }'

curl -s -X POST http://localhost:3000/api/3pl/coyote \
  -H "Content-Type: application/json" \
  -d '{ "origin": "27513", "destination": "07001" }'
```

By default, each response includes a randomized `quote_price` from `$1200` to `$1800` and `estimated_transit_hours` from `24` to `48`. The `auto` and `hitl` scripts use fixed quote prices so the demo outcome is repeatable. The Subconscious agent uses these through the `fetch_quotes` tool.

To run the local Subconscious freight negotiator demo:

```bash
SUBCONSCIOUS_API_KEY=sky_... npm run agent:freight
```

Set `SLACK_WEBHOOK_URL` to post the Block Kit approval alert to your Slack App incoming webhook. Without it, the script prints the mock Slack payload and still logs `Waiting for human approval...`.

Two-terminal demo commands:

```bash
# Terminal 1: autonomous booking scenario
npm run mock:3pl:auto

# Terminal 2
set -a; . ./.dev.vars; set +a
npm run agent:freight
```

```bash
# Terminal 1: human-in-the-loop scenario
npm run mock:3pl:hitl

# Terminal 2
set -a; . ./.dev.vars; set +a
npm run agent:freight
```

For a real Slack post in the HITL scenario, add `SLACK_WEBHOOK_URL` to `.dev.vars` or run:

```bash
set -a; . ./.dev.vars; set +a
SLACK_WEBHOOK_URL="https://hooks.slack.com/services/..." npm run agent:freight
```

### 1. Trigger — when does it run?

| Trigger | When to use | How |
|---------|-------------|-----|
| **Button** | Demos, manual testing | Dashboard → Run now |
| **API** | User-facing apps, internal tools | `POST /api/run` |
| **Webhook** | External events (tickets, shipments, orders) | `POST /api/webhook` |
| **Cron** | Scheduled digests, monitoring | Edit `[triggers].crons` in `wrangler.toml` |

```bash
# Run on demand
curl -X POST http://localhost:8787/api/run \
  -H "Content-Type: application/json" \
  -d '{"instructions": "A customer wants a mid-century desk under $500."}'

# React to an event
curl -X POST http://localhost:8787/api/webhook \
  -H "Content-Type: application/json" \
  -d '{"event": "shipment.delayed", "payload": { "orderId": "WF-9912" }}'
```

### 2. Harness — configure the loop

Set the system prompt, default instructions, and enabled tools via the dashboard at `/` or API:

```bash
curl -X PUT http://localhost:8787/api/agent/config \
  -H "Content-Type: application/json" \
  -d '{
    "systemPrompt": "You are a logistics negotiator for a major furniture retailer. Your goal is to secure the cheapest alternative freight rate under $1500.",
    "instructions": "Recover the dropped NC-to-NJ freight lane by fetching backup 3PL quotes. If the best quote is over $1500, request human approval through Slack before booking.",
    "enabledTools": ["fetch_quotes", "request_human_approval"]
  }'
```

The harness (ReAct loop) lives in `src/agent/loop.ts`. Defaults are in `src/types.ts`.

### 3. LLM — the brain

Point the harness at Subconscious with your API key:

```bash
cp .dev.vars.example .dev.vars
# SUBCONSCIOUS_API_KEY=sky_...  (from subconscious.dev/platform)
```

Model: `subconscious/tim-qwen3.6-27b` via `src/subconscious/client.ts`:

```typescript
const subconscious = createSubconscious(apiKey, { enableThinking: true });
const response = await subconscious.chat(SUBCONSCIOUS_MODEL).completions.create({
  messages: [{ role: "user", content: "Hello" }],
});
```

Use **`subconscious.chat(model)`** → `/v1/chat/completions`. Do not use `/v1/responses` (unsupported).

Subconscious defaults **thinking ON**. This starter keeps thinking on by default via a custom `fetch` on `createOpenAI` that merges `chat_template_kwargs: { enable_thinking: true }` into every chat request body. Set `enableThinking: false` on `createSubconscious()` to opt out for faster responses.

### 4. Tools — the hands

Edit `src/agent/tools.ts` — copy `search_catalog` as a template:

```typescript
search_catalog: {
  name: "search_catalog",
  description: "Search furniture by style, room, or dimensions",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string" },
      maxPrice: { type: "number" },
    },
    required: ["query"],
  },
  execute: async (args) => {
    return { results: [{ name: "Sofa", sku: "WF-123", price: 899 }] };
  },
},
```

Enable tools in the dashboard or add them to `enabledTools` in config.

Set `WEBHOOK_SECRET` in `.dev.vars` to require an `x-webhook-secret` header on webhooks in production.

---

## API quick reference

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/agent/config` | Read agent config |
| `PUT` | `/api/agent/config` | Update agent config |
| `GET` | `/api/agent/tools` | List available tools |
| `POST` | `/api/run` | Run the agent now |
| `POST` | `/api/webhook` | Run on external event |
| `GET` | `/api/runs` | Recent run history |
| `GET` | `/api/runs/:id` | Single run details |

---

## Project layout

```
Trigger     →  src/index.ts           routes, cron, webhooks
Harness     →  src/agent/loop.ts      ReAct loop
               src/agent/store.ts     config + run history
LLM         →  src/subconscious/      Subconscious client
Tools       →  src/agent/tools.ts     ← add your tools here
examples/shopping-assistant/         Track 1 example
public/index.html                    Dashboard
resources/                           optional offline SDK clones (not in git)
scripts/fetch-resources.sh           clone Workers SDK / Baseten repos locally
```

### Optional offline references

This repo does **not** commit the full Cloudflare Workers SDK or Baseten trees (~5k files). To browse them locally:

```bash
./scripts/fetch-resources.sh
```

See [resources/README.md](./resources/README.md).

---

## AI coding assistant setup

Install the Subconscious skill so Cursor, Claude Code, or Codex understand the API:

```bash
npx skills add https://github.com/subconscious-systems/skills --skill subconscious-dev
```

Already bundled at `.agents/skills/subconscious-dev/`. See [AGENTS.md](./AGENTS.md) for file-level guidance.

---

## Subconscious API

| | |
|---|---|
| Base URL | `https://api.subconscious.dev/v1` |
| Model | `subconscious/tim-qwen3.6-27b` |
| Auth | `SUBCONSCIOUS_API_KEY` in `.dev.vars` |
| Tools | Client-side ReAct loop — **your Worker runs them** (see [hack-cli-starter](https://github.com/subconscious-systems/subconscious/tree/main/examples/hack-cli-starter)) |

Docs: [docs.subconscious.dev](https://docs.subconscious.dev) · Playground: [subconscious.dev/playground](https://www.subconscious.dev/playground)

---

## Baseten Qwen3 deployment

This repo includes a Baseten Truss config for deploying `Qwen/Qwen3-4B-Instruct-2507` as an OpenAI-compatible TRT-LLM deployment. This is the current small official Qwen3 target for the hackathon; there was no official `Qwen3.5-3B` checkpoint available when this config was added.

```bash
cd qwen-3-4b-instruct-2507
truss push
```

The config lives at [qwen-3-4b-instruct-2507/config.yaml](./qwen-3-4b-instruct-2507/config.yaml):

```yaml
model_name: Qwen3-4B-Instruct-2507
resources:
  accelerator: L4
model_metadata:
  tags:
    - openai-compatible
trt_llm:
  build:
    base_model: decoder
    checkpoint_repository:
      source: HF
      repo: "Qwen/Qwen3-4B-Instruct-2507"
    max_seq_len: 8192
    quantization_type: fp8
    tensor_parallel_count: 1
```

What each section does:

- `resources.accelerator: L4` selects an L4 GPU with 24 GB VRAM for inference.
- `trt_llm` uses Baseten Engine-Builder-LLM / TensorRT-LLM to compile the model for optimized inference.
- `checkpoint_repository` pulls the ungated Hugging Face weights from `Qwen/Qwen3-4B-Instruct-2507`; no HF token is needed.
- `quantization_type: fp8` compresses weights to 8-bit floating point to reduce memory usage with minimal quality impact.
- `model_metadata.tags: [openai-compatible]` marks the deployment for OpenAI-compatible usage.

After `truss push`, Baseten prints a logs URL like:

```text
https://app.baseten.co/models/abc1d2ef/logs/xyz123
```

The model ID is the segment after `/models/` (`abc1d2ef` in this example). Use that ID when calling the model API. Wait until the deployment status is `Active` in the Baseten dashboard before sending requests.

---

## Tips

- Try the [shopping assistant example](./examples/shopping-assistant/README.md) before building from scratch.
- Prototype prompts in [hack-cli-starter](https://github.com/subconscious-systems/subconscious/tree/main/examples/hack-cli-starter), then deploy here.
- Start with one track, one trigger, and one tool — then expand.
- Use the dashboard to iterate on prompts before writing code.
- Thinking is on by default for stronger reasoning. Set `enableThinking: false` for faster responses when the task is simple.
- Mock external data in tools first; swap in real APIs when the agent logic works.

Good luck — build something useful for Wayfair customers, suppliers, or ops teams.
