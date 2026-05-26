import { runAgentLoop } from "./loop";
import type { AgentConfig } from "../types";
import type { ToolExecutionContext } from "./tools";

export interface RunAgentInput {
  config: AgentConfig;
  instructions: string;
  apiKey: string;
  maxToolRounds?: number;
  toolContext?: ToolExecutionContext;
}

export interface RunAgentResult {
  answer: string;
  toolCalls: Array<{ name: string; arguments: string; result: string }>;
  usage?: {
    promptTokens: number;
    completionTokens: number;
  };
}

export async function runAgent(input: RunAgentInput): Promise<RunAgentResult> {
  const result = await runAgentLoop({
    apiKey: input.apiKey,
    systemPrompt: input.config.systemPrompt,
    instructions: input.instructions,
    enabledTools: input.config.enabledTools,
    maxSteps: input.maxToolRounds ?? 8,
    maxTokens: input.config.maxTokens,
    temperature: input.config.temperature,
    enableThinking: input.config.enableThinking,
    toolContext: input.toolContext,
  });

  return {
    answer: result.answer,
    toolCalls: result.toolCalls,
  };
}
