import express from "express";

const app = express();
const port = Number.parseInt(process.env.MOCK_3PL_PORT ?? "3000", 10);
const quoteScenario = readQuoteScenario(process.env.MOCK_3PL_SCENARIO);

const scenarioQuotes = {
  auto: {
    XPO: { quote_price: 1359, estimated_transit_hours: 35 },
    Coyote: { quote_price: 1448, estimated_transit_hours: 41 },
  },
  hitl: {
    XPO: { quote_price: 1640, estimated_transit_hours: 34 },
    Coyote: { quote_price: 1725, estimated_transit_hours: 30 },
  },
};

app.use(express.json());

function randomInteger(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function readQuoteScenario(value) {
  const scenario = value?.trim().toLowerCase() || "random";
  if (["random", "auto", "hitl"].includes(scenario)) {
    return scenario;
  }

  console.warn(
    `[3PL] Unknown MOCK_3PL_SCENARIO "${value}", falling back to random quotes`,
  );
  return "random";
}

function readLaneRequest(req, res) {
  const { origin, destination } = req.body ?? {};

  if (typeof origin !== "string" || origin.trim() === "") {
    res.status(400).json({ error: "origin is required and must be a non-empty string" });
    return null;
  }

  if (typeof destination !== "string" || destination.trim() === "") {
    res.status(400).json({ error: "destination is required and must be a non-empty string" });
    return null;
  }

  return {
    origin: origin.trim(),
    destination: destination.trim(),
  };
}

function buildQuote(carrier, lane) {
  const fixedQuote = scenarioQuotes[quoteScenario]?.[carrier];

  return {
    carrier,
    origin: lane.origin,
    destination: lane.destination,
    quote_price: fixedQuote?.quote_price ?? randomInteger(1200, 1800),
    estimated_transit_hours:
      fixedQuote?.estimated_transit_hours ?? randomInteger(24, 48),
    currency: "USD",
    scenario: quoteScenario,
    quote_id: `${carrier.toLowerCase()}-${Date.now()}-${randomInteger(1000, 9999)}`,
  };
}

function quoteHandler(carrier) {
  return (req, res) => {
    console.log(`=== [3PL] ${carrier} quote request received ===`);
    console.log("[3PL] Request body:", req.body);

    const lane = readLaneRequest(req, res);
    if (!lane) {
      console.log(`[3PL] ${carrier} quote rejected: invalid lane request`);
      return;
    }

    const quote = buildQuote(carrier, lane);
    console.log(`[3PL] ${carrier} quote response:`, quote);
    res.json(quote);
  };
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "mock-3pl-environment" });
});

app.post("/api/3pl/xpo", quoteHandler("XPO"));
app.post("/api/3pl/coyote", quoteHandler("Coyote"));

app.use((err, _req, res, _next) => {
  console.error("[3PL] Request failed:", err);
  res.status(400).json({ error: "invalid JSON request body" });
});

app.listen(port, () => {
  console.log(`=== [3PL] Mock 3PL environment listening on http://localhost:${port} ===`);
  console.log(`[3PL] Quote scenario: ${quoteScenario}`);
  console.log("[3PL] POST /api/3pl/xpo    { origin, destination }");
  console.log("[3PL] POST /api/3pl/coyote { origin, destination }");
});
