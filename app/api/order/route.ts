import { NextResponse } from "next/server";
import { findOrder, normalizeOrderId } from "@/lib/orders";

// Order lookup used by the get_order_details tool. The browser forwards the
// model's tool call here, then returns the JSON as a function_call_output.

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = null;
  }

  const rec = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const raw = typeof rec["orderId"] === "string" ? rec["orderId"] : "";

  if (!raw.trim()) {
    return NextResponse.json(
      { found: false, error: "MISSING_ORDER_ID", message: "No order ID was provided. Ask the customer for it." },
      { status: 400 },
    );
  }

  const normalizedId = normalizeOrderId(raw);
  if (!normalizedId) {
    return NextResponse.json(
      { found: false, error: "MISSING_ORDER_ID", message: "Could not parse an order number from the input." },
      { status: 400 },
    );
  }

  const order = findOrder(normalizedId);
  if (!order) {
    return NextResponse.json({
      found: false,
      error: "ORDER_NOT_FOUND",
      normalized_id: normalizedId,
      message: "No order exists with this ID. Ask the customer to repeat or verify it.",
    });
  }

  return NextResponse.json({ found: true, order });
}
