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
    <section className="orders-panel panel">
      <div className="panel-heading"><h2>Orders to try</h2><span className="panel-meta">3 sample orders</span></div>
      <p className="mb-3 text-xs text-gray-500">
        Use one of these sample order IDs when Aria asks for your order number.
      </p>
      <div className="order-list">
        {ORDERS.map((o) => (
          <div key={o.order_id} className="order-row text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono font-semibold text-gray-900">{o.order_id}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[o.status] ?? "bg-gray-100 text-gray-700"}`}>
                {o.status}
              </span>
            </div>
            <p className="order-customer">{o.customer_name}<span>₹{o.amount_inr.toLocaleString("en-IN")}</span></p>
            <p className="order-product">{o.items}</p>
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
