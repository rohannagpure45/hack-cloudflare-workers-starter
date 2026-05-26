import OpenAI from "openai";

const SUBCONSCIOUS_BASE_URL = "https://api.subconscious.dev/v1";
const SUBCONSCIOUS_MODEL =
  process.env.SUBCONSCIOUS_MODEL ?? "subconscious/tim-qwen3.6-27b";
const MOCK_3PL_BASE_URL = process.env.MOCK_3PL_BASE_URL ?? "http://localhost:3000";
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;
const APPROVAL_BASE_URL =
  process.env.APPROVAL_BASE_URL ?? "https://my-worker.workers.dev";
const SPOT_RATE_THRESHOLD_USD = 1500;

const SYSTEM_PROMPT =
  "You are a logistics negotiator for a major furniture retailer. Your goal is to secure the cheapest alternative freight rate under $1500.";

const scenario = {
  lane_id: process.env.LANE_ID ?? "NC-NJ-CASTLEGATE-001",
  origin: process.env.ORIGIN_ZIP ?? "27513",
  destination: process.env.DEST_ZIP ?? "07001",
  supplier: "North Carolina sofa supplier",
  fulfillment_center: "New Jersey fulfillment center",
  dropped_carrier: "Primary contracted carrier",
};

function requireSubconsciousApiKey() {
  if (!process.env.SUBCONSCIOUS_API_KEY) {
    throw new Error("SUBCONSCIOUS_API_KEY is required to run the freight agent.");
  }
  return process.env.SUBCONSCIOUS_API_KEY;
}

function formatUsd(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`POST ${url} failed (${response.status}): ${text}`);
  }

  return response.json();
}

async function fetchQuotes(args) {
  const origin = String(args.origin ?? scenario.origin);
  const destination = String(args.destination ?? scenario.destination);

  console.log("[fetch_quotes] Requesting XPO and Coyote spot quotes", {
    origin,
    destination,
    baseUrl: MOCK_3PL_BASE_URL,
  });

  const [xpo, coyote] = await Promise.all([
    postJson(`${MOCK_3PL_BASE_URL}/api/3pl/xpo`, { origin, destination }),
    postJson(`${MOCK_3PL_BASE_URL}/api/3pl/coyote`, { origin, destination }),
  ]);

  const quotes = [xpo, coyote];
  const bestQuote = [...quotes].sort((a, b) => a.quote_price - b.quote_price)[0];

  const result = {
    lane_id: args.lane_id ?? scenario.lane_id,
    origin,
    destination,
    threshold_usd: SPOT_RATE_THRESHOLD_USD,
    quotes,
    best_quote: bestQuote,
    requires_human_approval: bestQuote.quote_price > SPOT_RATE_THRESHOLD_USD,
  };

  console.log("[fetch_quotes] Best quote", {
    carrier: bestQuote.carrier,
    price: bestQuote.quote_price,
    requiresHumanApproval: result.requires_human_approval,
  });

  return result;
}

function buildSlackPayload(args) {
  const laneId = args.lane_id ?? scenario.lane_id;
  const origin = args.origin ?? scenario.origin;
  const destination = args.destination ?? scenario.destination;
  const carrierName = args.carrier_name;
  const price = Number(args.price);
  const estimatedTransitHours = args.estimated_transit_hours;
  const quoteId = args.quote_id;

  const fields = [
    { type: "mrkdwn", text: `*Origin*\n${origin}` },
    { type: "mrkdwn", text: `*Destination*\n${destination}` },
    { type: "mrkdwn", text: `*Carrier Name*\n${carrierName}` },
    { type: "mrkdwn", text: `*Price*\n${formatUsd(price)}` },
  ];

  if (estimatedTransitHours !== undefined) {
    fields.push({
      type: "mrkdwn",
      text: `*Transit Window*\n${estimatedTransitHours} hours`,
    });
  }

  if (laneId) {
    fields.push({ type: "mrkdwn", text: `*Lane ID*\n${laneId}` });
  }

  if (quoteId) {
    fields.push({ type: "mrkdwn", text: `*Quote ID*\n${quoteId}` });
  }

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
        fields,
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "Approve", emoji: true },
            style: "primary",
            url: `${APPROVAL_BASE_URL}/approve`,
          },
          {
            type: "button",
            text: { type: "plain_text", text: "Reject", emoji: true },
            style: "danger",
            url: `${APPROVAL_BASE_URL}/reject`,
          },
        ],
      },
    ],
  };
}

async function requestHumanApproval(args) {
  const payload = buildSlackPayload(args);

  if (SLACK_WEBHOOK_URL) {
    console.log("[request_human_approval] Sending Slack approval alert");
    const response = await fetch(SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Slack webhook failed (${response.status}): ${text}`);
    }
  } else {
    console.log(
      "[request_human_approval] SLACK_WEBHOOK_URL is not set; mock Slack payload:",
    );
    console.log(JSON.stringify(payload, null, 2));
  }

  console.log("Waiting for human approval...");

  return {
    sent: Boolean(SLACK_WEBHOOK_URL),
    waiting_for_human_approval: true,
    approval_urls: {
      approve: `${APPROVAL_BASE_URL}/approve`,
      reject: `${APPROVAL_BASE_URL}/reject`,
    },
    slack_payload: SLACK_WEBHOOK_URL ? undefined : payload,
  };
}

const tools = [
  {
    type: "function",
    function: {
      name: "fetch_quotes",
      description:
        "Call the local mock 3PL Express server to fetch XPO and Coyote spot-market freight quotes.",
      parameters: {
        type: "object",
        properties: {
          lane_id: { type: "string" },
          origin: { type: "string", description: "Origin ZIP code" },
          destination: { type: "string", description: "Destination ZIP code" },
        },
        required: ["origin", "destination"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "request_human_approval",
      description:
        "Send a Slack Block Kit human override alert when the best freight quote is over $1500.",
      parameters: {
        type: "object",
        properties: {
          lane_id: { type: "string" },
          origin: { type: "string" },
          destination: { type: "string" },
          carrier_name: { type: "string" },
          price: { type: "number" },
          estimated_transit_hours: { type: "number" },
          quote_id: { type: "string" },
        },
        required: ["origin", "destination", "carrier_name", "price"],
      },
    },
  },
];

const toolHandlers = {
  fetch_quotes: fetchQuotes,
  request_human_approval: requestHumanApproval,
};

function parseToolArguments(raw) {
  if (!raw) return {};
  return JSON.parse(raw);
}

async function run() {
  const client = new OpenAI({
    baseURL: SUBCONSCIOUS_BASE_URL,
    apiKey: requireSubconsciousApiKey(),
  });

  const messages = [
    {
      role: "system",
      content: `${SYSTEM_PROMPT}

Rules:
- Always call fetch_quotes before making a decision.
- If fetch_quotes returns requires_human_approval=true, you must call request_human_approval with the best_quote details before your final answer.
- If the best quote is $1500 or less, recommend that carrier for autonomous booking.
- Keep the final answer concise and operational.`,
    },
    {
      role: "user",
      content: `A primary carrier dropped this freight lane:
${JSON.stringify(scenario, null, 2)}

Recover the lane now.`,
    },
  ];

  console.log("[agent] Starting Subconscious freight negotiator", {
    model: SUBCONSCIOUS_MODEL,
    lane: scenario.lane_id,
  });

  let mustRequestHumanApproval = false;

  for (let round = 1; round <= 6; round++) {
    const response = await client.chat.completions.create({
      model: SUBCONSCIOUS_MODEL,
      messages,
      tools,
      tool_choice: mustRequestHumanApproval
        ? { type: "function", function: { name: "request_human_approval" } }
        : "auto",
      temperature: 0.2,
      max_tokens: 900,
      chat_template_kwargs: { enable_thinking: false },
    });

    const message = response.choices[0]?.message;
    if (!message) {
      throw new Error("Subconscious returned no message.");
    }

    messages.push(message);

    if (!message.tool_calls?.length) {
      console.log("\n[agent] Final answer:");
      console.log(message.content ?? "");
      return;
    }

    for (const toolCall of message.tool_calls) {
      const name = toolCall.function.name;
      const handler = toolHandlers[name];
      if (!handler) {
        throw new Error(`No local handler registered for tool: ${name}`);
      }

      const args = parseToolArguments(toolCall.function.arguments);
      console.log(`[agent] Tool call: ${name}`, args);
      const result = await handler(args);
      mustRequestHumanApproval =
        name === "fetch_quotes" && result.requires_human_approval === true;

      if (name === "request_human_approval") {
        mustRequestHumanApproval = false;
      }

      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: JSON.stringify(result),
      });
    }
  }

  throw new Error("Agent exceeded 6 tool rounds without a final answer.");
}

run().catch((error) => {
  console.error("[agent] Failed:", error);
  process.exitCode = 1;
});
