// One conversational turn for Aria against NVIDIA NIM (OpenAI-compatible chat
// completions), including the get_order_details tool loop. Shared by the
// /api/chat route and the scripts/eval.ts harness, so what we test is what ships.

import { findOrder, normalizeOrderId } from "./orders.ts";
import { ARIA_INSTRUCTIONS, ORDER_TOOL, ORDER_TOOL_NAME } from "./prompt.ts";

const NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
const MAX_TOOL_ROUNDS = 3;

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface ToolCallRecord {
  name: string;
  args: string;
  result: Record<string, unknown>;
}

export interface TurnResult {
  reply: string;
  toolCalls: ToolCallRecord[];
}

export class ChatError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.status = status;
  }
}

type Message = Record<string, unknown>;

function asRecord(v: unknown): Record<string, unknown> | undefined {
  return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : undefined;
}

export function runOrderTool(rawArgs: string): Record<string, unknown> {
  let orderId = "";
  try {
    const args = asRecord(JSON.parse(rawArgs));
    if (typeof args?.["order_id"] === "string") orderId = args["order_id"];
  } catch {
    /* fall through to MISSING_ORDER_ID */
  }
  const normalized = orderId.trim() ? normalizeOrderId(orderId) : null;
  if (!normalized) {
    return { found: false, error: "MISSING_ORDER_ID", message: "No valid order ID. Ask the customer for it." };
  }
  const order = findOrder(normalized);
  if (!order) {
    return {
      found: false,
      error: "ORDER_NOT_FOUND",
      normalized_id: normalized,
      message: "No order exists with this ID. Ask the customer to repeat or verify it.",
    };
  }
  return { found: true, order };
}

// An explicit "ORD 101" / "order number 102" in the customer's words. Spoken
// forms ("one zero one") are left to the model, which passes them to the tool.
const ORDER_MENTION = /\b(?:ord(?:er)?)[\s\-#:.]*(?:no\.?|number|num|id)?[\s\-#:.]*(\d{2,6})\b/i;

export function detectOrderMention(text: string): string | null {
  const m = ORDER_MENTION.exec(text);
  return m ? m[1] : null;
}

export async function runChatTurn(
  turns: ChatTurn[],
  opts: { apiKey: string; model: string },
): Promise<TurnResult> {
  const tool = {
    type: "function",
    function: { name: ORDER_TOOL_NAME, description: ORDER_TOOL.description, parameters: ORDER_TOOL.parameters },
  };
  const messages: Message[] = [{ role: "system", content: ARIA_INSTRUCTIONS }, ...turns];
  const toolCalls: ToolCallRecord[] = [];
  let emptyRetries = 1;

  // Guarantee the lookup when the customer clearly named an order: run the tool
  // ourselves and hand the model the result, so it can neither skip the call
  // nor ask for an ID it was already given.
  const mention = detectOrderMention(turns[turns.length - 1]?.content ?? "");
  if (mention) {
    const args = JSON.stringify({ order_id: mention });
    const result = runOrderTool(args);
    toolCalls.push({ name: ORDER_TOOL_NAME, args, result });
    messages.push({
      role: "assistant",
      content: null,
      tool_calls: [{ id: "lookup_0", type: "function", function: { name: ORDER_TOOL_NAME, arguments: args } }],
    });
    messages.push({ role: "tool", tool_call_id: "lookup_0", content: JSON.stringify(result) });
  }

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const res = await fetch(NVIDIA_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${opts.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: opts.model,
        temperature: 0.2,
        max_tokens: 400,
        tools: [tool],
        tool_choice: "auto",
        messages,
      }),
      cache: "no-store",
    });

    const data: unknown = await res.json().catch(() => undefined);
    if (!res.ok) {
      console.error("Chat request failed:", res.status, data);
      throw new ChatError(`NVIDIA chat request failed (HTTP ${res.status}).`);
    }

    const choices = asRecord(data)?.["choices"];
    const message = asRecord(Array.isArray(choices) ? asRecord(choices[0])?.["message"] : undefined);
    if (!message) throw new ChatError("Chat response was empty.");

    const calls = Array.isArray(message["tool_calls"]) ? (message["tool_calls"] as unknown[]) : [];
    if (calls.length === 0) {
      const reply = typeof message["content"] === "string" ? message["content"].trim() : "";
      if (!reply) {
        if (emptyRetries-- > 0) continue; // occasional empty completion - try once more
        throw new ChatError("Chat response had no text.");
      }
      return { reply, toolCalls };
    }

    messages.push({ role: "assistant", content: null, tool_calls: calls });
    for (const call of calls) {
      const c = asRecord(call);
      const fn = asRecord(c?.["function"]);
      const callId = typeof c?.["id"] === "string" ? c["id"] : "";
      const name = typeof fn?.["name"] === "string" ? fn["name"] : "";
      const args = typeof fn?.["arguments"] === "string" ? fn["arguments"] : "{}";
      const result = name === ORDER_TOOL_NAME ? runOrderTool(args) : { error: "UNKNOWN_TOOL" };
      toolCalls.push({ name, args, result });
      messages.push({ role: "tool", tool_call_id: callId, content: JSON.stringify(result) });
    }
  }
  throw new ChatError("Too many tool calls in one turn.");
}
