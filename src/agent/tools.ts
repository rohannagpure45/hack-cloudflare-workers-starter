export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (
    args: Record<string, unknown>,
    context?: ToolExecutionContext,
  ) => Promise<unknown> | unknown;
}

export interface ToolExecutionContext {
  mock3plBaseUrl?: string;
  slackWebhookUrl?: string;
  approvalBaseUrl?: string;
}

interface FreightQuote {
  carrier: string;
  origin: string;
  destination: string;
  quote_price: number;
  estimated_transit_hours: number;
  currency?: string;
  quote_id?: string;
}

const SPOT_RATE_THRESHOLD_USD = 1500;
const DEFAULT_MOCK_3PL_BASE_URL = "http://localhost:3000";
const DEFAULT_APPROVAL_BASE_URL = "https://my-worker.workers.dev";

function approvalActionUrl(
  approvalBaseUrl: string,
  action: "approve" | "reject",
  laneId?: string,
): string {
  const url = new URL(`/${action}`, approvalBaseUrl.replace(/\/$/, "") + "/");
  if (laneId) {
    url.searchParams.set("lane_id", laneId);
  }
  return url.toString();
}

function readNodeEnv(name: string): string | undefined {
  const processLike = (globalThis as {
    process?: { env?: Record<string, string | undefined> };
  }).process;
  return processLike?.env?.[name];
}

function cleanToolString(value: string): string {
  return value.replace(/<\/?\s*parameter\b\s*>?/gi, "").trim();
}

function requireString(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${key} is required and must be a non-empty string`);
  }
  return cleanToolString(value);
}

function optionalString(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  return typeof value === "string" && cleanToolString(value).length > 0
    ? cleanToolString(value)
    : undefined;
}

function requireFiniteNumber(args: Record<string, unknown>, key: string): number {
  const raw = args[key];
  const value =
    typeof raw === "number"
      ? raw
      : Number(cleanToolString(String(raw)).replace(/[$,]/g, ""));
  if (!Number.isFinite(value)) {
    throw new Error(`${key} is required and must be a finite number`);
  }
  return value;
}

function formatUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

async function fetchProviderQuote(
  baseUrl: string,
  endpoint: string,
  origin: string,
  destination: string,
): Promise<FreightQuote> {
  const response = await fetch(`${baseUrl}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ origin, destination }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`3PL quote request failed (${response.status}): ${body}`);
  }

  return (await response.json()) as FreightQuote;
}

interface LaneNotificationInput {
  laneId?: string;
  origin: string;
  destination: string;
  carrierName: string;
  price: number;
  estimatedTransitHours?: number;
  quoteId?: string;
}

function parseLaneNotificationArgs(
  args: Record<string, unknown>,
): LaneNotificationInput {
  const estimatedTransitRaw = args.estimated_transit_hours;
  return {
    laneId: optionalString(args, "lane_id"),
    origin: requireString(args, "origin"),
    destination: requireString(args, "destination"),
    carrierName: requireString(args, "carrier_name"),
    price: requireFiniteNumber(args, "price"),
    estimatedTransitHours:
      estimatedTransitRaw === undefined
        ? undefined
        : requireFiniteNumber(args, "estimated_transit_hours"),
    quoteId: optionalString(args, "quote_id"),
  };
}

function buildSlackLaneFields(
  input: LaneNotificationInput,
): Array<{ type: "mrkdwn"; text: string }> {
  const details = [
    { type: "mrkdwn" as const, text: `*Origin*\n${input.origin}` },
    { type: "mrkdwn" as const, text: `*Destination*\n${input.destination}` },
    { type: "mrkdwn" as const, text: `*Carrier*\n${input.carrierName}` },
    { type: "mrkdwn" as const, text: `*Price*\n${formatUsd(input.price)}` },
  ];

  if (input.estimatedTransitHours !== undefined) {
    details.push({
      type: "mrkdwn",
      text: `*Transit Window*\n${input.estimatedTransitHours} hours`,
    });
  }

  if (input.laneId) {
    details.push({ type: "mrkdwn", text: `*Lane ID*\n${input.laneId}` });
  }

  if (input.quoteId) {
    details.push({ type: "mrkdwn", text: `*Quote ID*\n${input.quoteId}` });
  }

  return details;
}

async function deliverSlackNotification(
  context: ToolExecutionContext | undefined,
  payload: Record<string, unknown>,
  logLabel: string,
): Promise<{ sent: boolean; slack_payload?: Record<string, unknown> }> {
  const webhookUrl =
    context?.slackWebhookUrl ?? readNodeEnv("SLACK_WEBHOOK_URL");

  if (webhookUrl) {
    console.log(`[SLACK] ${logLabel}`);
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Slack webhook failed (${response.status}): ${body}`);
    }

    return { sent: true };
  }

  console.log(`[SLACK] SLACK_WEBHOOK_URL is not set; mock payload (${logLabel}):`);
  console.log(JSON.stringify(payload, null, 2));
  return { sent: false, slack_payload: payload };
}

function buildSlackAutonomousBookingPayload(
  input: LaneNotificationInput,
): Record<string, unknown> {
  return {
    text: "✅ Lane Recovered: Autonomous Booking Confirmed",
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "✅ Lane Recovered — Autonomous Booking",
          emoji: true,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Best spot rate is at or below the $${SPOT_RATE_THRESHOLD_USD.toLocaleString("en-US")} autonomous booking limit.* The backup carrier is being booked without human approval.`,
        },
      },
      {
        type: "section",
        fields: buildSlackLaneFields(input),
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: "Informational notification only — no action required.",
          },
        ],
      },
    ],
  };
}

function buildSlackApprovalPayload(
  input: LaneNotificationInput & { approvalBaseUrl: string },
): Record<string, unknown> {
  const details = buildSlackLaneFields(input);

  return {
    text: "🚨 Human Override Required: Spot Market Exception",
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "🚨 Human Override Required: Spot Market Exception",
          emoji: true,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*Best available spot-market rate is above the $1,500 autonomous booking limit.*",
        },
      },
      {
        type: "section",
        fields: details,
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "Approve", emoji: true },
            style: "primary",
            url: approvalActionUrl(
              input.approvalBaseUrl,
              "approve",
              input.laneId,
            ),
          },
          {
            type: "button",
            text: { type: "plain_text", text: "Reject", emoji: true },
            style: "danger",
            url: approvalActionUrl(
              input.approvalBaseUrl,
              "reject",
              input.laneId,
            ),
          },
        ],
      },
    ],
  };
}

export const TOOL_REGISTRY: Record<string, ToolDefinition> = {
  fetch_quotes: {
    name: "fetch_quotes",
    description:
      "Fetch freight spot-market quotes from mock 3PL providers XPO and Coyote for one origin/destination lane.",
    parameters: {
      type: "object",
      properties: {
        lane_id: { type: "string", description: "Optional dropped lane identifier" },
        origin: { type: "string", description: "Origin ZIP code" },
        destination: { type: "string", description: "Destination ZIP code" },
      },
      required: ["origin", "destination"],
    },
    execute: async (args, context) => {
      const laneId = optionalString(args, "lane_id");
      const origin = requireString(args, "origin");
      const destination = requireString(args, "destination");
      const baseUrl =
        context?.mock3plBaseUrl ??
        readNodeEnv("MOCK_3PL_BASE_URL") ??
        DEFAULT_MOCK_3PL_BASE_URL;

      console.log("[FREIGHT] Fetching XPO and Coyote spot quotes", {
        laneId,
        origin,
        destination,
        baseUrl,
      });

      const quotes = await Promise.all([
        fetchProviderQuote(baseUrl, "/api/3pl/xpo", origin, destination),
        fetchProviderQuote(baseUrl, "/api/3pl/coyote", origin, destination),
      ]);

      const bestQuote = [...quotes].sort(
        (a, b) => a.quote_price - b.quote_price,
      )[0];

      return {
        lane_id: laneId,
        origin,
        destination,
        threshold_usd: SPOT_RATE_THRESHOLD_USD,
        quotes,
        best_quote: bestQuote,
        requires_human_approval:
          bestQuote.quote_price > SPOT_RATE_THRESHOLD_USD,
      };
    },
  },

  request_human_approval: {
    name: "request_human_approval",
    description:
      "Send a Slack Block Kit approval alert when the best freight spot quote is over $1500.",
    parameters: {
      type: "object",
      properties: {
        lane_id: { type: "string", description: "Optional dropped lane identifier" },
        origin: { type: "string", description: "Origin ZIP code" },
        destination: { type: "string", description: "Destination ZIP code" },
        carrier_name: {
          type: "string",
          description: "Carrier name for the best quote",
        },
        price: { type: "number", description: "Best quote price in USD" },
        estimated_transit_hours: {
          type: "number",
          description: "Estimated transit time in hours",
        },
        quote_id: {
          type: "string",
          description: "Optional provider quote identifier",
        },
      },
      required: ["origin", "destination", "carrier_name", "price"],
    },
    execute: async (args, context) => {
      const lane = parseLaneNotificationArgs(args);
      const approvalBaseUrl =
        context?.approvalBaseUrl ??
        readNodeEnv("APPROVAL_BASE_URL") ??
        DEFAULT_APPROVAL_BASE_URL;
      const payload = buildSlackApprovalPayload({
        ...lane,
        approvalBaseUrl,
      });
      const delivery = await deliverSlackNotification(
        context,
        payload,
        "Sending human approval alert",
      );

      console.log("Waiting for human approval...");

      return {
        ...delivery,
        notification_type: "approval_required",
        waiting_for_human_approval: true,
        approval_urls: {
          approve: approvalActionUrl(approvalBaseUrl, "approve", lane.laneId),
          reject: approvalActionUrl(approvalBaseUrl, "reject", lane.laneId),
        },
      };
    },
  },

  notify_lane_recovery: {
    name: "notify_lane_recovery",
    description:
      "Send a Slack notification when the best freight spot quote is within policy and the agent is auto-booking without human approval.",
    parameters: {
      type: "object",
      properties: {
        lane_id: { type: "string", description: "Optional dropped lane identifier" },
        origin: { type: "string", description: "Origin ZIP code" },
        destination: { type: "string", description: "Destination ZIP code" },
        carrier_name: {
          type: "string",
          description: "Carrier name for the best quote",
        },
        price: { type: "number", description: "Best quote price in USD" },
        estimated_transit_hours: {
          type: "number",
          description: "Estimated transit time in hours",
        },
        quote_id: {
          type: "string",
          description: "Optional provider quote identifier",
        },
      },
      required: ["origin", "destination", "carrier_name", "price"],
    },
    execute: async (args, context) => {
      const lane = parseLaneNotificationArgs(args);
      const payload = buildSlackAutonomousBookingPayload(lane);
      const delivery = await deliverSlackNotification(
        context,
        payload,
        "Sending autonomous booking notification",
      );

      console.log("[SLACK] Autonomous booking in progress (demo)");

      return {
        ...delivery,
        notification_type: "autonomous_booking",
        autonomous_booking: true,
        carrier: lane.carrierName,
        price_usd: lane.price,
      };
    },
  },

  get_time: {
    name: "get_time",
    description: "Get the current UTC date and time",
    parameters: {
      type: "object",
      properties: {},
    },
    execute: () => ({
      utc: new Date().toISOString(),
      timezone: "UTC",
    }),
  },

  log_note: {
    name: "log_note",
    description: "Save a short note for the hackathon team to review later",
    parameters: {
      type: "object",
      properties: {
        note: { type: "string", description: "The note to save" },
        priority: {
          type: "string",
          enum: ["low", "medium", "high"],
          description: "How urgent this note is",
        },
      },
      required: ["note"],
    },
    execute: async (args) => {
      const note = String(args.note ?? "");
      const priority = String(args.priority ?? "medium");
      return {
        saved: true,
        note,
        priority,
        savedAt: new Date().toISOString(),
      };
    },
  },

  search_catalog: {
    name: "search_catalog",
    description:
      "Search mock Wayfair furniture by room, style, or keyword. Returns SKU, price, and dimensions.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search terms, e.g. mid-century desk" },
        room: {
          type: "string",
          enum: ["living", "bedroom", "office", "dining", "outdoor"],
          description: "Room type filter",
        },
        maxPrice: { type: "number", description: "Maximum price in USD" },
      },
      required: ["query"],
    },
    execute: async (args) => {
      const query = String(args.query ?? "").toLowerCase();
      const room = args.room ? String(args.room) : undefined;
      const maxPrice =
        typeof args.maxPrice === "number" ? args.maxPrice : undefined;

      const catalog = [
        {
          sku: "WF-1001",
          name: "Mid-Century Writing Desk",
          room: "office",
          style: "mid-century",
          price: 349,
          dimensions: '48"W x 24"D x 30"H',
        },
        {
          sku: "WF-1002",
          name: "Scandinavian Platform Bed",
          room: "bedroom",
          style: "scandinavian",
          price: 499,
          dimensions: 'Queen 63"W x 83"L',
        },
        {
          sku: "WF-1003",
          name: "Velvet Sectional Sofa",
          room: "living",
          style: "modern",
          price: 899,
          dimensions: '112"W x 70"D',
        },
        {
          sku: "WF-1004",
          name: "Farmhouse Dining Table",
          room: "dining",
          style: "farmhouse",
          price: 629,
          dimensions: '72"W x 40"D x 30"H',
        },
        {
          sku: "WF-1005",
          name: "Compact Home Office Desk",
          room: "office",
          style: "modern",
          price: 199,
          dimensions: '40"W x 20"D x 29"H',
        },
      ];

      let results = catalog.filter((item) => {
        const haystack = `${item.name} ${item.style} ${item.room}`.toLowerCase();
        return haystack.includes(query) || query.split(" ").some((w) => haystack.includes(w));
      });

      if (room) {
        results = results.filter((item) => item.room === room);
      }
      if (maxPrice !== undefined) {
        results = results.filter((item) => item.price <= maxPrice);
      }

      return { query, count: results.length, results: results.slice(0, 5) };
    },
  },

  fetch_url: {
    name: "fetch_url",
    description: "Fetch text content from a public HTTPS URL",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "HTTPS URL to fetch" },
      },
      required: ["url"],
    },
    execute: async (args) => {
      const url = String(args.url ?? "");
      if (!url.startsWith("https://")) {
        throw new Error("Only HTTPS URLs are allowed");
      }
      const response = await fetch(url, {
        headers: { "User-Agent": "HackathonAgent/1.0" },
      });
      const text = await response.text();
      return {
        url,
        status: response.status,
        preview: text.slice(0, 500),
      };
    },
  },
};

export function getEnabledTools(enabledTools: string[]): ToolDefinition[] {
  return enabledTools
    .filter((name) => TOOL_REGISTRY[name])
    .map((name) => TOOL_REGISTRY[name]);
}

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  context?: ToolExecutionContext,
): Promise<string> {
  const tool = TOOL_REGISTRY[name];
  if (!tool) {
    return JSON.stringify({ error: `Unknown tool: ${name}` });
  }

  try {
    const result = await tool.execute(args, context);
    return JSON.stringify(result);
  } catch (error) {
    return JSON.stringify({
      error: error instanceof Error ? error.message : "Tool execution failed",
    });
  }
}
