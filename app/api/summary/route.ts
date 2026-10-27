import { NextResponse } from "next/server";

// Generates the structured post-call summary with strict JSON output.
// Uses the normal (non-realtime) Chat Completions API.

const SUMMARY_MODEL = process.env.NVIDIA_SUMMARY_MODEL ?? "nvidia/nemotron-3-ultra-550b-a55b";
const NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions";

export interface SummaryInput {
  role: "customer" | "aria";
  text: string;
  at: number;
}

const SUMMARY_SCHEMA = {
  type: "object",
  properties: {
    customer_intent: {
      type: "string",
      enum: [
        "ORDER_TRACKING",
        "CANCELLATION",
        "RETURN_REFUND",
        "SHIPPING_INFO",
        "COD_INFO",
        "PRODUCT_INFO",
        "OUT_OF_SCOPE",
        "OTHER",
      ],
    },
    order_id: { type: ["string", "null"], description: "Canonical order ID like ORD-101, or null." },
    resolution_status: {
      type: "string",
      enum: ["RESOLVED", "UNRESOLVED", "ESCALATED", "OUT_OF_SCOPE"],
    },
    call_summary: { type: "string", description: "1-3 sentence summary of the call." },
  },
  required: ["customer_intent", "order_id", "resolution_status", "call_summary"],
  additionalProperties: false,
} as const;

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

  const rec = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const transcript = Array.isArray(rec["transcript"]) ? rec["transcript"] : [];

  const lines: string[] = [];
  for (const entry of transcript) {
    if (typeof entry !== "object" || entry === null) continue;
    const e = entry as Record<string, unknown>;
    const role = e["role"] === "aria" ? "Aria" : "Customer";
    const text = typeof e["text"] === "string" ? e["text"].trim() : "";
    if (text) lines.push(`${role}: ${text}`);
  }

  if (lines.length === 0) {
    return NextResponse.json({ error: "Transcript is empty - nothing to summarize." }, { status: 400 });
  }

  const systemPrompt = [
    "You are an analytics assistant for Aura Skincare customer support calls.",
    "Read the voice-call transcript below and produce the structured summary.",
    "Guidelines:",
    "- customer_intent: the customer's primary reason for calling, using exactly one enum value.",
    "- order_id: the order ID discussed, normalized to the form ORD-<number> (e.g. ORD-101); null if none.",
    "- resolution_status: RESOLVED if the customer's question/request was answered or handled within policy,",
    "  UNRESOLVED if it could not be handled (e.g. outside policy windows, not-found order, not completed),",
    "  ESCALATED if it needs a human follow-up (e.g. an action the agent cannot perform),",
    "  OUT_OF_SCOPE if the request was unrelated to Aura Skincare.",
    "- call_summary: 1-3 sentences, factual, mention the outcome.",
    "Base everything strictly on the transcript. Never invent details.",
  ].join(" ");

  try {
    const res = await fetch(NVIDIA_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: SUMMARY_MODEL,
        temperature: 0,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "call_summary",
            strict: true,
            schema: SUMMARY_SCHEMA,
          },
        },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: "Transcript:\n\n" + lines.join("\n") },
        ],
      }),
      cache: "no-store",
    });

    const data: unknown = await res.json().catch(() => undefined);
    if (!res.ok) {
      console.error("Summary request failed:", res.status, data);
      return NextResponse.json({ error: `NVIDIA summary request failed (HTTP ${res.status}).` }, { status: 502 });
    }

    const drec = typeof data === "object" && data !== null ? (data as Record<string, unknown>) : {};
    const choices = Array.isArray(drec["choices"]) ? drec["choices"] : [];
    const first = typeof choices[0] === "object" && choices[0] !== null ? (choices[0] as Record<string, unknown>) : {};
    const message = typeof first["message"] === "object" && first["message"] !== null ? (first["message"] as Record<string, unknown>) : {};
    const content = typeof message["content"] === "string" ? message["content"] : "";

    if (!content) {
      return NextResponse.json({ error: "Summary response was empty." }, { status: 502 });
    }

    const parsed: unknown = JSON.parse(content);
    const s = typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : null;
    if (!s || typeof s["customer_intent"] !== "string" || typeof s["call_summary"] !== "string") {
      return NextResponse.json({ error: "Summary JSON did not match the expected shape." }, { status: 502 });
    }

    return NextResponse.json({
      customer_intent: s["customer_intent"],
      order_id: s["order_id"] ?? null,
      resolution_status: s["resolution_status"] ?? "UNRESOLVED",
      call_summary: s["call_summary"],
    });
  } catch (err) {
    console.error("Summary generation error:", err);
    return NextResponse.json({ error: "Could not generate the summary." }, { status: 502 });
  }
}
