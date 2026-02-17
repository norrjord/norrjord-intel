/**
 * Anthropic Claude API wrapper
 *
 * All responses are parsed as JSON. No prose output.
 * Uses two models:
 * - Haiku for cheap first-pass classification
 * - Sonnet for deep analysis
 */

import Anthropic from "@anthropic-ai/sdk";

// ─── Models ─────────────────────────────────────────────

export const MODELS = {
  classify: "claude-haiku-4-5-20251001" as const,
  analyze: "claude-sonnet-4-5-20250929" as const,
  draft: "claude-sonnet-4-5-20250929" as const,
};

// ─── Client singleton ───────────────────────────────────

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");
    client = new Anthropic({ apiKey });
  }
  return client;
}

// ─── Core JSON completion ───────────────────────────────

interface CompletionOptions {
  system: string;
  user: string;
  model: string;
  maxTokens?: number;
}

/**
 * Send a prompt to Claude and parse the response as JSON.
 * Throws if the response isn't valid JSON.
 */
export async function completeJson<T>(options: CompletionOptions): Promise<T> {
  const anthropic = getClient();

  const response = await anthropic.messages.create({
    model: options.model,
    max_tokens: options.maxTokens ?? 2048,
    system: options.system,
    messages: [{ role: "user", content: options.user }],
  });

  // Extract text from response
  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from Claude");
  }

  const raw = textBlock.text.trim();

  // Try to parse JSON — handle cases where model wraps in ```json
  let jsonStr = raw;
  if (jsonStr.startsWith("```")) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  try {
    return JSON.parse(jsonStr) as T;
  } catch (err) {
    console.error("[claude] Failed to parse JSON response:", raw.slice(0, 500));
    throw new Error(`Claude returned invalid JSON: ${(err as Error).message}`);
  }
}

// ─── Token usage tracking (for cost awareness) ──────────

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  model: string;
}

const usageLog: TokenUsage[] = [];

export async function completeJsonTracked<T>(
  options: CompletionOptions,
): Promise<{ data: T; usage: TokenUsage }> {
  const anthropic = getClient();

  const response = await anthropic.messages.create({
    model: options.model,
    max_tokens: options.maxTokens ?? 2048,
    system: options.system,
    messages: [{ role: "user", content: options.user }],
  });

  const usage: TokenUsage = {
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    model: options.model,
  };
  usageLog.push(usage);

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from Claude");
  }

  let jsonStr = textBlock.text.trim();
  if (jsonStr.startsWith("```")) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  try {
    const data = JSON.parse(jsonStr) as T;
    return { data, usage };
  } catch (err) {
    console.error("[claude] Failed to parse JSON response:", jsonStr.slice(0, 500));
    throw new Error(`Claude returned invalid JSON: ${(err as Error).message}`);
  }
}

/**
 * Get accumulated token usage for this session (useful for cost reporting)
 */
export function getUsageSummary() {
  const summary = {
    totalInputTokens: 0,
    totalOutputTokens: 0,
    callsByModel: {} as Record<string, number>,
  };

  for (const u of usageLog) {
    summary.totalInputTokens += u.inputTokens;
    summary.totalOutputTokens += u.outputTokens;
    summary.callsByModel[u.model] = (summary.callsByModel[u.model] ?? 0) + 1;
  }

  return summary;
}

export function resetUsageLog() {
  usageLog.length = 0;
}
