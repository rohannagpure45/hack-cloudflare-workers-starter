# AI assistant guide

Hackathon starter: **Cloudflare Workers + Subconscious API** for Wayfair agent challenges.

## Repository root

- **Git root = workspace root.** All product changes go here (`src/`, `wrangler.toml`, etc.), not in a nested folder.
- **Remote:** `https://github.com/rohannagpure45/hack-cloudflare-workers-starter.git`
- Before `git push`, run `./scripts/verify-git-remote.sh`.
- `local/` is gitignored scratch space only.

## Current project target

**Project docs:** [docs/ROADMAP.md](docs/ROADMAP.md) (status & priorities) · [docs/INTEGRATION.md](docs/INTEGRATION.md) (APIs, architecture, agent integration)

Build the **Freight Rate Spot Market Negotiator** for Wayfair supplier and procurement operations.

The product story: a primary carrier drops a lane from a North Carolina supplier to a New Jersey fulfillment center. A Cloudflare Worker catches the dropped-lane event, provisions or triggers a Subconscious lane-recovery agent, calls Baseten for a fair-market baseline, fetches quotes from mock 3PL providers, negotiates toward the best rate, and either books automatically or asks a human logistics manager for approval through a Slack App message.

The demo should prove that a process normally handled through roughly three hours of procurement emails can complete in a few seconds with clear logs and an enterprise-safe approval path. Do not build a separate UI as the main demo surface; the output is a Slack App webhook message with approval actions.

## Sponsor stack division of labor

| Sponsor/tool | Project role |
|--------------|--------------|
| Cloudflare Workers | Webhook trigger, edge orchestration, mock 3PL APIs, Slack approval callback, visible demo logs. |
| Baseten | Baseline fair-market lane price service, implemented as a lightweight deployed model or sprint-safe mock call. |
| Subconscious API | Negotiator brain that compares quotes, reasons about price versus delivery windows, drafts counter-offers, and decides whether to book or escalate. |

## Freight recovery workflow

1. Trigger a dropped-lane webhook with `lane_id`, `origin_zip`, `dest_zip`, supplier, fulfillment center, shipment weight, and delivery deadline.
2. Return `200 OK` quickly to the telemetry sender while the Worker starts the recovery flow.
3. Fetch the Baseten fair-market baseline for the lane.
4. Call mock 3PL quote APIs such as XPO and Coyote.
5. Let Subconscious compare rate, transit time, and baseline delta.
6. Counter-offer or select the best viable carrier.
7. Auto-book only if the negotiated rate is within 10% of baseline.
8. Request human approval if the best viable rate is materially above baseline, especially around 20% or more over baseline.
9. Send the operator-facing output as a Slack App webhook message, not a standalone UI.
10. Finalize or reject the booking through a Slack approve/reject callback to the Worker.

## Demo-quality requirements

- Add highly visible `console.log` statements for every step of the flow.
- Keep mock APIs local-first unless deployment is required for the demo; ngrok is acceptable for connecting a deployed Worker to localhost.
- Approval messages should be Slack App webhook payloads and should include lane, carrier, quote, baseline, percent over baseline, delivery guarantee, one-sentence rationale, and approve/reject actions.
- Avoid building a dashboard UI unless explicitly requested later; Slack is the human-in-the-loop interface for this project.
- Treat a pure autonomous blank checkbook as a compliance failure; always preserve the HITL threshold.
- Optimize for an end-to-end 60-second recording over broad generic starter coverage.

## Tracks

1. **Consumer shopping** — discovery, recommendations, buyer experience
2. **Supply chain** — shipments, suppliers, logistics
3. **FinOps & customer service** — tickets, refunds, internal ops

## Anatomy of an agent

Every agent is four parts: **trigger**, **harness**, **LLM**, **tools**.

| Part | Role | In this starter |
|------|------|-----------------|
| **Trigger** | Wakes the agent | `src/index.ts` — webhook, cron, API, button |
| **Harness** | Runs the ReAct loop | `src/agent/loop.ts` on a Cloudflare Worker |
| **LLM** | Brain — reasons and decides | Subconscious API |
| **Tools** | Hands — fetch data, take action | `src/agent/tools.ts` |

## Subconscious skill

```bash
npx skills add https://github.com/subconscious-systems/skills --skill subconscious-dev
```

Bundled at `.agents/skills/subconscious-dev/`.

## Flow

```
Trigger → Harness (loop.ts) → LLM (Subconscious) → Tools (tools.ts)
```

Same ReAct pattern as [hack-cli-starter](https://github.com/subconscious-systems/subconscious/tree/main/examples/hack-cli-starter).

## Example

Track 1 shopping assistant: `examples/shopping-assistant/` — run with `bash examples/shopping-assistant/run.sh`

## Edit these files

| Goal | File |
|------|------|
| Agent loop | `src/agent/loop.ts` |
| Default prompts / config | `src/types.ts` |
| Add tools (main hackathon work) | `src/agent/tools.ts` |
| New routes or triggers | `src/index.ts` |
| Cron schedule | `wrangler.toml` |
| Baseten Qwen deployment config | `qwen-3-4b-instruct-2507/config.yaml` |

## Env vars

- `SUBCONSCIOUS_API_KEY` — required ([get key](https://www.subconscious.dev/platform))
- `WEBHOOK_SECRET` — optional, protects `POST /api/webhook`

## API

- `PUT /api/agent/config` — update agent logic
- `POST /api/run` — run now (`{ "instructions": "..." }`)
- `POST /api/webhook` — event trigger
- `POST /webhook/dropped-lane` — freight telemetry (200 immediately, agent in background)
- `GET /api/runs` — history

Full route spec: [docs/INTEGRATION.md](docs/INTEGRATION.md).

## Subconscious

- Base: `https://api.subconscious.dev/v1`
- Model: `subconscious/tim-qwen3.6-27b`
- Client: `createSubconscious(apiKey).chat(model).completions.create(...)` — **not** `/v1/responses`
- Thinking defaults ON at Subconscious and in this starter via custom `fetch` in `createOpenAI` (`enable_thinking: true`)
- Tools are client-side — Worker executes them, not Subconscious

Full API details: `.agents/skills/subconscious-dev/SKILL.md`

## Baseten Qwen3 4B deployment

Use `qwen-3-4b-instruct-2507/config.yaml` to deploy `Qwen/Qwen3-4B-Instruct-2507` to Baseten. This is the current small official Qwen3 target for this project; no official `Qwen3.5-3B` checkpoint was available when this config was added.

```bash
cd qwen-3-4b-instruct-2507
truss push
```

Config summary:

- `model_name: Qwen3-4B-Instruct-2507`
- `resources.accelerator: L4` for 24 GB VRAM inference.
- `model_metadata.tags: [openai-compatible]`.
- `trt_llm.build` uses Baseten Engine-Builder-LLM / TensorRT-LLM.
- `checkpoint_repository.repo: Qwen/Qwen3-4B-Instruct-2507`; the Hugging Face repo is ungated.
- `max_seq_len: 8192`, `quantization_type: fp8`, `tensor_parallel_count: 1`.

After `truss push`, the Baseten logs URL contains the model ID after `/models/`, for example `https://app.baseten.co/models/abc1d2ef/logs/xyz123` has model ID `abc1d2ef`. Wait for the deployment to show `Active` in the Baseten dashboard before calling it.
