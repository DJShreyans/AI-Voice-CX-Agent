// Checks the post-call summary labels on scripted transcripts.
//   node scripts/summary-eval.ts [model ...]

import { readFileSync } from "node:fs";
import { SUMMARY_SCHEMA, SUMMARY_SYSTEM_PROMPT } from "../lib/summary.ts";

const env: Record<string, string | undefined> = { ...process.env };
try {
  for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !env[m[1]]) env[m[1]] = m[2].trim();
  }
} catch {
  /* use process.env */
}
const apiKey = env.NVIDIA_API_KEY;
if (!apiKey) {
  console.error("NVIDIA_API_KEY missing.");
  process.exit(1);
}

const G = "Aria: Hello! I'm Aria from Aura Skincare. How can I help you today?\n";
const CASES = [
  {
    name: "return outside window",
    transcript: G + "Customer: I want to return the sunscreen from order 102.\nAria: Order ORD-102 was delivered 14 days ago, which is outside our 7-day return window, so I'm unable to accept a return.",
    want: { customer_intent: "RETURN_REFUND", order_id: "ORD-102", resolution_status: /UNRESOLVED|RESOLVED/ },
  },
  {
    name: "tracking",
    transcript: G + "Customer: Where is my order ORD 101?\nAria: ORD-101 is out for delivery with BlueDart and expected by 6 PM today.\nCustomer: Great, thanks.",
    want: { customer_intent: "ORDER_TRACKING", order_id: "ORD-101", resolution_status: /^RESOLVED$/ },
  },
  {
    name: "cancel eligible",
    transcript: G + "Customer: Please cancel order 103.\nAria: ORD-103 is still processing, so it is eligible for cancellation, and it will be confirmed and processed.",
    want: { customer_intent: "CANCELLATION", order_id: "ORD-103", resolution_status: /RESOLVED|ESCALATED/ },
  },
  {
    name: "order not found",
    transcript: G + "Customer: Track order 999.\nAria: I couldn't locate an order with that number, could you please repeat or verify the ID?\nCustomer: I don't have it right now.",
    want: { customer_intent: "ORDER_TRACKING", order_id: /ORD-999|null/, resolution_status: /^UNRESOLVED$/ },
  },
  {
    name: "out of scope",
    transcript: G + "Customer: Can you book me a flight to Goa?\nAria: I can only help with Aura Skincare queries. Is there anything about your orders I can help with?",
    want: { customer_intent: "OUT_OF_SCOPE", order_id: null, resolution_status: /^OUT_OF_SCOPE$/ },
  },
  {
    name: "COD question",
    transcript: G + "Customer: Is cash on delivery available?\nAria: Yes, COD is available for orders up to 2,500 rupees, payable by cash or UPI at the doorstep.",
    want: { customer_intent: "COD_INFO", order_id: null, resolution_status: /^RESOLVED$/ },
  },
];

type Want = (typeof CASES)[number]["want"];
const matches = (got: unknown, want: unknown): boolean =>
  want instanceof RegExp ? want.test(String(got)) : got === want;

async function summarize(model: string, transcript: string): Promise<Record<string, unknown>> {
  const res = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: 600,
      response_format: { type: "json_schema", json_schema: { name: "call_summary", strict: true, schema: SUMMARY_SCHEMA } },
      messages: [
        { role: "system", content: SUMMARY_SYSTEM_PROMPT },
        { role: "user", content: "Transcript:\n\n" + transcript },
      ],
    }),
  });
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return JSON.parse(data.choices?.[0]?.message?.content ?? "{}") as Record<string, unknown>;
}

const models = process.argv.slice(2);
if (models.length === 0) models.push(env.NVIDIA_SUMMARY_MODEL ?? "nvidia/nemotron-3.5-bolt-e4b");

for (const model of models) {
  console.log(`\n=== ${model} ===`);
  let passed = 0;
  let totalMs = 0;
  for (const c of CASES) {
    const t0 = Date.now();
    let out: Record<string, unknown> = {};
    try {
      out = await summarize(model, c.transcript);
    } catch (err) {
      out = { error: String(err) };
    }
    const ms = Date.now() - t0;
    totalMs += ms;
    const bad = (Object.keys(c.want) as (keyof Want)[]).filter((k) => !matches(out[k], c.want[k]));
    if (bad.length === 0) passed++;
    console.log(`${bad.length === 0 ? "PASS" : "FAIL"}  ${c.name} (${(ms / 1000).toFixed(1)}s)${bad.length ? `  wrong: ${bad.map((k) => `${k}=${String(out[k])}`).join(", ")}` : ""}`);
  }
  console.log(`--- ${passed}/${CASES.length} passed, avg ${(totalMs / CASES.length / 1000).toFixed(1)}s`);
}
