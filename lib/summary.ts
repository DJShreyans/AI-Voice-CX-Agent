// Schema + prompt for the structured post-call summary. Shared by /api/summary
// and scripts/summary-eval.ts.

export const SUMMARY_SCHEMA = {
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

export const SUMMARY_SYSTEM_PROMPT = [
  "You are an analytics assistant for Aura Skincare customer support calls.",
  "Read the voice-call transcript and produce the structured summary.",
  "",
  "customer_intent - the customer's primary REQUEST (what they asked for), not the topic Aria happened to mention. Use exactly one:",
  "- ORDER_TRACKING: where is my order / delivery status / courier / ETA.",
  "- CANCELLATION: wants to cancel an order.",
  "- RETURN_REFUND: wants to return a product, get a refund, or a replacement for a damaged/defective item.",
  "- SHIPPING_INFO: general shipping charges or delivery-time policy, not about one specific order's status.",
  "- COD_INFO: cash on delivery questions.",
  "- PRODUCT_INFO: questions about products, prices or ingredients.",
  "- OUT_OF_SCOPE: unrelated to Aura Skincare (flights, other brands, general knowledge).",
  "- OTHER: anything else.",
  "If the customer asked for several things, pick the first or main one.",
  "",
  "order_id - the order discussed, written as ORD-<number> (e.g. ORD-101); null if none.",
  "",
  "resolution_status:",
  "- RESOLVED: the question was answered or handled correctly within policy (a polite, correct refusal counts as resolved only if the customer got a clear answer).",
  "- UNRESOLVED: the customer's request could not be completed or answered (e.g. order not found, outside policy window and they still wanted it, info missing).",
  "- ESCALATED: needs human follow-up (an action the agent cannot perform).",
  "- OUT_OF_SCOPE: the request was unrelated to Aura Skincare.",
  "",
  "call_summary - 1-3 factual sentences stating what the customer asked and the outcome.",
  "Base everything strictly on the transcript. Never invent details.",
].join("\n");
