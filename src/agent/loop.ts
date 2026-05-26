// ReAct agent loop — adapted from subconscious/examples/hack-cli-starter
// https://github.com/subconscious-systems/subconscious/tree/main/examples/hack-cli-starter
//
// Subconscious chat completions do not run tools server-side. We list tools in the
// system prompt and force structured JSON output so each turn is either tool_call
// or final_answer.

import type OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { createSubconscious, SUBCONSCIOUS_MODEL } from "../subconscious/client";
import { buildSystemPrompt } from "./prompt";
import { executeTool, getEnabledTools, type ToolDefinition } from "./tools";

const RESPONSE_FORMAT = {
  type: "json_schema",
  json_schema: {
    name: "agent_response",
    strict: true,
    schema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["tool_call", "final_answer"] },
        tool: { type: "string" },
        arguments: { type: "object" },
        content: { type: "string" },
      },
      required: ["action"],
      additionalProperties: false,
    },
  },
} as const satisfies OpenAI.Chat.Completions.ChatCompletionCreateParams["response_format"];

interface AgentResponse {
  action: "tool_call" | "final_answer";
  tool?: string;
  arguments?: Record<string, unknown>;
  content?: string;
}

export interface LoopStep {
  type: "tool_call" | "tool_result" | "final_answer";
  tool?: string;
  arguments?: Record<string, unknown>;
  result?: unknown;
  content?: string;
}

export interface RunLoopInput {
  apiKey: string;
  systemPrompt: string;
  instructions: string;
  enabledTools: string[];
  maxSteps?: number;
  maxTokens?: number;
  temperature?: number;
  enableThinking?: boolean;
}

export interface RunLoopResult {
  answer: string;
  steps: LoopStep[];
  toolCalls: Array<{ name: string; arguments: string; result: string }>;
}

export async function runAgentLoop(input: RunLoopInput): Promise<RunLoopResult> {
  const subconscious = createSubconscious(input.apiKey, {
    enableThinking: input.enableThinking ?? true,
  });
  const chat = subconscious.chat(SUBCONSCIOUS_MODEL);
  const tools = getEnabledTools(input.enabledTools);
  const maxSteps = input.maxSteps ?? 8;

  const system = buildSystemPrompt(input.systemPrompt, tools);
  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: system },
    { role: "user", content: input.instructions },
  ];

  const steps: LoopStep[] = [];
  const toolCalls: RunLoopResult["toolCalls"] = [];

  for (let step = 0; step < maxSteps; step++) {
    const response = await chat.completions.create({
      messages,
      max_tokens: input.maxTokens ?? 1000,
      temperature: input.temperature ?? 0.7,
      response_format: RESPONSE_FORMAT,
    });

    const raw = response.choices[0]?.message?.content ?? "";
    const parsed = parseResponse(raw);

    if (parsed.action === "final_answer") {
      const content = parsed.content ?? "";
      steps.push({ type: "final_answer", content });
      return { answer: content, steps, toolCalls };
    }

    const toolName = parsed.tool ?? "";
    const args = parsed.arguments ?? {};
    steps.push({ type: "tool_call", tool: toolName, arguments: args });

    messages.push({ role: "assistant", content: raw });

    try {
      const result = await executeTool(toolName, args);
      toolCalls.push({
        name: toolName,
        arguments: JSON.stringify(args),
        result,
      });
      steps.push({ type: "tool_result", tool: toolName, result: JSON.parse(result) });
      messages.push({
        role: "user",
        content: `Tool "${toolName}" returned:\n${result}`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      steps.push({ type: "tool_result", tool: toolName, result: { error: message } });
      messages.push({
        role: "user",
        content: `Tool "${toolName}" failed with error:\n${message}`,
      });
    }
  }

  return {
    answer: `Agent exceeded ${maxSteps} steps without a final answer.`,
    steps,
    toolCalls,
  };
}

function parseResponse(raw: string): AgentResponse {
  const obj = JSON.parse(extractJson(raw)) as AgentResponse;
  if (obj.action !== "tool_call" && obj.action !== "final_answer") {
    throw new Error(`Unexpected action: ${JSON.stringify(obj.action)}`);
  }
  return obj;
}

function extractJson(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{")) return trimmed;
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start !== -1 && end > start) return trimmed.slice(start, end + 1);
  return trimmed;
}

export function formatToolsForDocs(tools: ToolDefinition[]): string {
  return tools.map((t) => `- **${t.name}** — ${t.description}`).join("\n");
}
