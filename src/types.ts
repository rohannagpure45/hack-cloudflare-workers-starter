export interface AgentConfig {
  name: string;
  systemPrompt: string;
  instructions: string;
  enableThinking: boolean;
  maxTokens: number;
  temperature: number;
  enabledTools: string[];
  cronInstructions: string;
}

export interface AgentRunRecord {
  id: string;
  trigger: "cron" | "api" | "button" | "webhook" | "dropped-lane";
  status: "running" | "completed" | "failed";
  input: string;
  output?: string;
  error?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
  };
  createdAt: string;
  completedAt?: string;
}

export interface Env {
  SUBCONSCIOUS_API_KEY: string;
  WEBHOOK_SECRET?: string;
  MOCK_3PL_BASE_URL?: string;
  SLACK_WEBHOOK_URL?: string;
  APPROVAL_BASE_URL?: string;
  AGENT_KV: KVNamespace;
  ASSETS: Fetcher;
}

export const CONFIG_KEY = "agent:config";
export const RUNS_PREFIX = "agent:run:";

export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  name: "Freight Spot Market Negotiator",
  systemPrompt:
    "You are a logistics negotiator for a major furniture retailer. Your goal is to secure the cheapest alternative freight rate under $1500.",
  instructions:
    "Recover the dropped NC-to-NJ freight lane by fetching backup 3PL quotes. If the best quote is over $1500, request human approval through Slack before booking.",
  enableThinking: false,
  maxTokens: 1000,
  temperature: 0.2,
  enabledTools: ["fetch_quotes", "request_human_approval"],
  cronInstructions:
    "Check whether any freight recovery lane needs attention. Do not book freight without an active dropped-lane event.",
};
