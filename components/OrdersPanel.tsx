"use client";

import { ORDERS } from "@/lib/orders";

const STATUS_BADGE: Record<string, string> = {
  Processing: "bg-amber-100 text-amber-800",
  Shipped: "bg-sky-100 text-sky-800",
  "Out for Delivery": "bg-indigo-100 text-indigo-800",
  Delivered: "bg-emerald-100 text-emerald-800",
};

export default function OrdersPanel() {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <h2 className="mb-1 text-base font-semibold text-gray-900">Test Orders Helper</h2>
      <p className="mb-3 text-xs text-gray-500">
        Keep this open while you test - use these IDs when Aria asks for the order number.
      </p>
      <div className="space-y-3">
        {ORDERS.map((o) => (
          <div key={o.order_id} className="rounded-lg border border-gray-200 p-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono font-semibold text-gray-900">{o.order_id}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[o.status] ?? "bg-gray-100 text-gray-700"}`}>
                {o.status}
              </span>
            </div>
            <p className="mt-1 text-gray-700">
              {o.customer_name} · {o.items} · ₹{o.amount_inr}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              {o.courier !== "-" ? `${o.courier} ${o.tracking_id} · ` : ""}
              {o.delivery_info}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              Cancellable: <strong>{o.cancellable ? "yes" : "no"}</strong> · Returnable now:{" "}
              <strong>{o.returnable ? "yes" : "no"}</strong>
              {o.days_since_delivery !== null ? ` · ${o.days_since_delivery} days since delivery` : ""}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
