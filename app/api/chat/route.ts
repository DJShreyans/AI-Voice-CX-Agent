import { NextResponse } from "next/server";
import { ChatError, runChatTurn, type ChatTurn } from "@/lib/chat";

// One conversational turn for Aria. The browser sends the text history (speech
// is handled client-side); the model call and order-lookup tool loop live in
// lib/chat.ts so the same code is exercised by scripts/eval.ts.

const CHAT_MODEL = process.env.NVIDIA_CHAT_MODEL ?? "nvidia/nemotron-3.5-bolt-e4b";

function asRecord(v: unknown): Record<string, unknown> | undefined {
  return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : undefined;
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

  const raw = asRecord(body)?.["messages"];
  const turns: ChatTurn[] = [];
  for (const m of Array.isArray(raw) ? raw : []) {
    const rec = asRecord(m);
    const role = rec?.["role"] === "assistant" ? "assistant" : rec?.["role"] === "user" ? "user" : null;
    const content = typeof rec?.["content"] === "string" ? rec["content"].trim() : "";
    if (role && content) turns.push({ role, content });
  }
  if (turns.length === 0 || turns[turns.length - 1].role !== "user") {
    return NextResponse.json({ error: "Expected a conversation ending with a user message." }, { status: 400 });
  }

  try {
    const { reply } = await runChatTurn(turns, { apiKey, model: CHAT_MODEL });
    return NextResponse.json({ reply });
  } catch (err) {
    if (err instanceof ChatError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Chat error:", err);
    return NextResponse.json({ error: "Could not reach the chat model." }, { status: 502 });
  }
}
