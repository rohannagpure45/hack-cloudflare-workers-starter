import { Hono } from "hono";
import { cors } from "hono/cors";
import {
  executeAgentRun,
  getAgentConfig,
  getRun,
  listRecentRuns,
  saveAgentConfig,
} from "./agent/store";
import { TOOL_REGISTRY } from "./agent/tools";
import { handleApprovalAction } from "./freight/approval";
import {
  parseDroppedLanePayload,
  processDroppedLane,
} from "./freight/dropped-lane";
import type { AgentConfig, Env } from "./types";

const app = new Hono<{ Bindings: Env }>();

app.use("/api/*", cors());

app.get("/api/health", (c) => {
  return c.json({ ok: true, service: "hack-agent-starter" });
});

app.get("/api/agent/config", async (c) => {
  const config = await getAgentConfig(c.env.AGENT_KV);
  return c.json(config);
});

app.put("/api/agent/config", async (c) => {
  const body = (await c.req.json()) as Partial<AgentConfig>;
  const config = await saveAgentConfig(c.env.AGENT_KV, body);
  return c.json(config);
});

app.get("/api/agent/tools", (c) => {
  const tools = Object.values(TOOL_REGISTRY).map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  }));
  return c.json({ tools });
});

app.get("/api/runs", async (c) => {
  const runs = await listRecentRuns(c.env.AGENT_KV);
  return c.json({ runs });
});

app.get("/api/runs/:id", async (c) => {
  const run = await getRun(c.env.AGENT_KV, c.req.param("id"));
  if (!run) {
    return c.json({ error: "Run not found" }, 404);
  }
  return c.json(run);
});

app.post("/api/run", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    instructions?: string;
    trigger?: "api" | "button";
  };

  const config = await getAgentConfig(c.env.AGENT_KV);
  const instructions = body.instructions ?? config.instructions;

  const run = await executeAgentRun(
    c.env,
    body.trigger ?? "api",
    instructions,
  );

  return c.json(run, run.status === "failed" ? 500 : 200);
});

app.post("/api/webhook", async (c) => {
  const secret = c.env.WEBHOOK_SECRET;
  if (secret) {
    const provided = c.req.header("x-webhook-secret");
    if (provided !== secret) {
      return c.json({ error: "Unauthorized webhook" }, 401);
    }
  }

  const body = (await c.req.json().catch(() => ({}))) as {
    event?: string;
    instructions?: string;
    payload?: unknown;
  };

  const config = await getAgentConfig(c.env.AGENT_KV);
  const eventName = body.event ?? "webhook";
  const instructions =
    body.instructions ??
    `An external event "${eventName}" was received.\n\nPayload:\n${JSON.stringify(body.payload ?? body, null, 2)}\n\nDecide what action to take and respond with a summary.`;

  const run = await executeAgentRun(c.env, "webhook", instructions);
  return c.json(run, run.status === "failed" ? 500 : 200);
});

app.post("/webhook/dropped-lane", async (c) => {
  console.log("=== [DROPPED-LANE] Webhook received ===");

  const secret = c.env.WEBHOOK_SECRET;
  if (secret) {
    const provided = c.req.header("x-webhook-secret");
    if (provided !== secret) {
      console.log("[DROPPED-LANE] Webhook auth failed");
      return c.json({ error: "Unauthorized webhook" }, 401);
    }
    console.log("[DROPPED-LANE] Webhook auth passed");
  }

  const raw = await c.req.json().catch(() => null);
  const parsed = parseDroppedLanePayload(raw);
  if (!parsed.ok) {
    console.log("[DROPPED-LANE] Validation failed:", parsed.error);
    return c.json({ error: parsed.error }, 400);
  }

  const { lane_id, origin_zip, dest_zip } = parsed.data;
  console.log("[DROPPED-LANE] Parsed lane:", { lane_id, origin_zip, dest_zip });
  console.log("[DROPPED-LANE] Returning 200 OK to sender (non-blocking)");

  c.executionCtx.waitUntil(
    processDroppedLane(c.env, parsed.data).catch((err) => {
      console.error("[DROPPED-LANE] Background agent run failed:", err);
    }),
  );

  return c.json(
    { ok: true, status: "processing", lane_id, origin_zip, dest_zip },
    200,
  );
});

app.get("/approve", (c) => handleApprovalAction(c, "approved"));
app.get("/reject", (c) => handleApprovalAction(c, "rejected"));

async function handleScheduled(env: Env): Promise<void> {
  const config = await getAgentConfig(env.AGENT_KV);
  await executeAgentRun(env, "cron", config.cronInstructions);
}

app.all("*", async (c) => {
  return c.env.ASSETS.fetch(c.req.raw);
});

export default {
  fetch: app.fetch,

  async scheduled(
    _controller: ScheduledController,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<void> {
    await handleScheduled(env);
  },
};
