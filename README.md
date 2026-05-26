# Wayfair × Subconscious Hackathon Starter

Build an AI agent on **Cloudflare Workers** powered by the [Subconscious API](https://docs.subconscious.dev).

This repo gives you all four pieces wired together — so you can focus on the problem, not the plumbing.

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
    "systemPrompt": "You are a Wayfair shopping assistant.",
    "instructions": "Help the user find furniture that fits their room.",
    "enabledTools": ["search_catalog", "log_note"]
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

## Tips

- Try the [shopping assistant example](./examples/shopping-assistant/README.md) before building from scratch.
- Prototype prompts in [hack-cli-starter](https://github.com/subconscious-systems/subconscious/tree/main/examples/hack-cli-starter), then deploy here.
- Start with one track, one trigger, and one tool — then expand.
- Use the dashboard to iterate on prompts before writing code.
- Thinking is on by default for stronger reasoning. Set `enableThinking: false` for faster responses when the task is simple.
- Mock external data in tools first; swap in real APIs when the agent logic works.

Good luck — build something useful for Wayfair customers, suppliers, or ops teams.
