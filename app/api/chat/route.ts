import { NextResponse } from "next/server";
import { findOrder, normalizeOrderId } from "@/lib/orders";
import { ARIA_INSTRUCTIONS, ORDER_TOOL, ORDER_TOOL_NAME } from "@/lib/prompt";

// One conversational turn for Aria. The browser sends the text history (speech
// is handled client-side); we call NVIDIA NIM (OpenAI-compatible chat
// completions), run the order lookup tool here, and return Aria's reply text.

const NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
const CHAT_MODEL = process.env.NVIDIA_CHAT_MODEL ?? "nvidia/nemotron-3.5-bolt-e4b";
const MAX_TOOL_ROUNDS = 3;

type ChatMessage = Record<string, unknown>;

function asRecord(v: unknown): Record<string, unknown> | undefined {
  return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : undefined;
}

function runOrderTool(rawArgs: string): Record<string, unknown> {
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

export async function POST(req: Request) {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "NVIDIA_API_KEY is not configured on the server." }, { status: 500 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const history = Array.isArray(asRecord(body)?.["messages"]) ? (asRecord(body)!["messages"] as unknown[]) : [];
  const turns: ChatMessage[] = [];
  for (const m of history) {
    const rec = asRecord(m);
    const role = rec?.["role"] === "assistant" ? "assistant" : rec?.["role"] === "user" ? "user" : null;
    const content = typeof rec?.["content"] === "string" ? rec["content"].trim() : "";
    if (role && content) turns.push({ role, content });
  }
  if (turns.length === 0 || turns[turns.length - 1]["role"] !== "user") {
    return NextResponse.json({ error: "Expected a conversation ending with a user message." }, { status: 400 });
  }

  const tool = {
    type: "function",
    function: { name: ORDER_TOOL_NAME, description: ORDER_TOOL.description, parameters: ORDER_TOOL.parameters },
  };
  const messages: ChatMessage[] = [{ role: "system", content: ARIA_INSTRUCTIONS }, ...turns];

  try {
    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const res = await fetch(NVIDIA_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: CHAT_MODEL,
          temperature: 0.3,
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
        return NextResponse.json({ error: `NVIDIA chat request failed (HTTP ${res.status}).` }, { status: 502 });
      }

      const choices = asRecord(data)?.["choices"];
      const message = asRecord(Array.isArray(choices) ? asRecord(choices[0])?.["message"] : undefined);
      if (!message) {
        return NextResponse.json({ error: "Chat response was empty." }, { status: 502 });
      }

      const toolCalls = Array.isArray(message["tool_calls"]) ? (message["tool_calls"] as unknown[]) : [];
      if (toolCalls.length === 0) {
        const reply = typeof message["content"] === "string" ? message["content"].trim() : "";
        if (!reply) {
          return NextResponse.json({ error: "Chat response had no text." }, { status: 502 });
        }
        return NextResponse.json({ reply });
      }

      // Echo the assistant tool-call message, then answer every call.
      messages.push({ role: "assistant", content: null, tool_calls: toolCalls });
      for (const call of toolCalls) {
        const c = asRecord(call);
        const fn = asRecord(c?.["function"]);
        const callId = typeof c?.["id"] === "string" ? c["id"] : "";
        const output =
          fn?.["name"] === ORDER_TOOL_NAME
            ? runOrderTool(typeof fn["arguments"] === "string" ? fn["arguments"] : "{}")
            : { error: "UNKNOWN_TOOL" };
        messages.push({ role: "tool", tool_call_id: callId, content: JSON.stringify(output) });
      }
    }
    return NextResponse.json({ error: "Too many tool calls in one turn." }, { status: 502 });
  } catch (err) {
    console.error("Chat error:", err);
    return NextResponse.json({ error: "Could not reach the chat model." }, { status: 502 });
  }
}
