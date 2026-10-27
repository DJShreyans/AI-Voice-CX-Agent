// Mock order database for Aura Skincare.
//
// The tool result sent back to the model includes derived policy fields
// (cancellable, returnable, days_since_delivery, ...) so the model never has
// to compute eligibility itself — it just reads the fields out loud.

export interface Order {
  order_id: string;
  customer_name: string;
  items: string;
  amount_inr: number;
  status: "Processing" | "Shipped" | "Out for Delivery" | "Delivered";
  courier: string;
  tracking_id: string;
  delivery_info: string;
  days_since_delivery: number | null;
  cancellable: boolean;
  cancellation_note: string;
  returnable: boolean;
  return_window_days: number;
  return_note: string;
  damaged_replacement_window_hours: number;
  notes: string[];
}

export const ORDERS: Order[] = [
  {
    order_id: "ORD-101",
    customer_name: "Priya Sharma",
    items: "Vitamin C Serum (30ml)",
    amount_inr: 699,
    status: "Out for Delivery",
    courier: "BlueDart",
    tracking_id: "BD-982103",
    delivery_info: "Out for delivery, expected by 6 PM today",
    days_since_delivery: null,
    cancellable: false,
    cancellation_note:
      "Order is Out for Delivery and can no longer be cancelled. The customer may refuse delivery at the doorstep; it will be returned to us.",
    returnable: false,
    return_window_days: 7,
    return_note: "Not yet delivered. Returns open for 7 days after delivery for unopened products.",
    damaged_replacement_window_hours: 48,
    notes: [
      "Amount ₹699 qualifies for COD (up to ₹2,500) - payable by cash or UPI at the doorstep.",
      "Free delivery (order above ₹499).",
    ],
  },
  {
    order_id: "ORD-102",
    customer_name: "Rahul Verma",
    items: "Hydrating Sunscreen SPF 50",
    amount_inr: 499,
    status: "Delivered",
    courier: "Delhivery",
    tracking_id: "DL-441029",
    delivery_info: "Delivered 14 days ago",
    days_since_delivery: 14,
    cancellable: false,
    cancellation_note: "Order is already delivered and cannot be cancelled.",
    returnable: false,
    return_window_days: 7,
    return_note:
      "Delivered 14 days ago, which is outside the 7-day return window. Returns are only accepted within 7 days of delivery for unopened, unused products in original packaging.",
    damaged_replacement_window_hours: 48,
    notes: [
      "If the customer reports a damaged or defective product, that had to be reported within 48 hours of delivery with photos - that window has passed.",
    ],
  },
  {
    order_id: "ORD-103",
    customer_name: "Ananya Patel",
    items: "Green Tea Face Wash + Toner",
    amount_inr: 850,
    status: "Processing",
    courier: "-",
    tracking_id: "-",
    delivery_info: "Processing, ordered 3 hours ago (not yet shipped)",
    days_since_delivery: null,
    cancellable: true,
    cancellation_note:
      "Order is still Processing, so it is eligible for cancellation. (This demo agent cannot perform the cancellation; it only confirms eligibility.)",
    returnable: false,
    return_window_days: 7,
    return_note: "Not yet delivered. Returns open for 7 days after delivery for unopened products.",
    damaged_replacement_window_hours: 48,
    notes: ["Amount ₹850 qualifies for COD (up to ₹2,500).", "Free delivery (order above ₹499)."],
  },
];

/**
 * Normalize a spoken or typed order id to the canonical "ORD-<number>" form.
 * Handles: "ORD-101", "ORD 101", "ord101", "order 101", "Order Number 101",
 * "101", and digit-by-digit dictation like "1 0 1" or "one zero one" when
 * transcribed as digits.
 */
export function normalizeOrderId(raw: string): string | null {
  const cleaned = (raw ?? "").toString().toUpperCase().trim();
  if (!cleaned) return null;

  const digitGroups = cleaned.match(/\d+/g);
  if (!digitGroups || digitGroups.length === 0) return null;

  let number: string;
  if (digitGroups.length === 1) {
    number = digitGroups[0];
  } else if (digitGroups.every((g) => g.length === 1)) {
    // "1 0 1" -> "101" (digit-by-digit readback)
    number = digitGroups.join("");
  } else {
    // "ORD 101 ORD 102" or stray digits - take the longest group.
    number = digitGroups.reduce((a, b) => (b.length > a.length ? b : a));
  }

  return `ORD-${number}`;
}

export function findOrder(normalizedId: string): Order | undefined {
  return ORDERS.find((o) => o.order_id === normalizedId);
}
