"use client";

import { useState } from "react";

export interface CallSummary {
  customer_intent: string;
  order_id: string | null;
  resolution_status: string;
  call_summary: string;
}

const INTENT_LABELS: Record<string, string> = {
  ORDER_TRACKING: "Order tracking",
  CANCELLATION: "Cancellation",
  RETURN_REFUND: "Return / refund",
  SHIPPING_INFO: "Shipping info",
  COD_INFO: "COD info",
  PRODUCT_INFO: "Product info",
  OUT_OF_SCOPE: "Out of scope",
  OTHER: "Other",
};

const STATUS_STYLE: Record<string, string> = {
  RESOLVED: "bg-emerald-100 text-emerald-800",
  UNRESOLVED: "bg-amber-100 text-amber-800",
  ESCALATED: "bg-rose-100 text-rose-800",
  OUT_OF_SCOPE: "bg-gray-200 text-gray-700",
};

export default function SummaryCard({
  summary,
  loading,
  error,
}: {
  summary: CallSummary | null;
  loading: boolean;
  error: string | null;
}) {
  const [copied, setCopied] = useState(false);

  async function copyJson() {
    if (!summary) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(summary, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="summary-panel panel">
      <div className="flex items-center justify-between">
        <h2 className="section-title">Call Summary</h2>
        {summary && (
          <button
            onClick={copyJson}
            className="rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 transition hover:bg-gray-50"
          >
            {copied ? "Copied!" : "Copy JSON"}
          </button>
        )}
      </div>

      {loading && <p className="mt-3 text-sm text-gray-500">Generating summary…</p>}

      {error && !loading && <p className="mt-3 text-sm text-rose-600">{error}</p>}

      {!loading && !error && !summary && (
        <p className="mt-3 text-sm text-gray-500">After your call, find the key details and next steps here.</p>
      )}

      {summary && !loading && (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-800">
              {INTENT_LABELS[summary.customer_intent] ?? summary.customer_intent}
            </span>
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                STATUS_STYLE[summary.resolution_status] ?? "bg-gray-100 text-gray-700"
              }`}
            >
              {summary.resolution_status}
            </span>
            {summary.order_id && (
              <span className="rounded-full bg-gray-100 px-2.5 py-1 font-mono text-xs font-medium text-gray-800">
                {summary.order_id}
              </span>
            )}
          </div>
          <p className="text-sm leading-relaxed text-gray-700">{summary.call_summary}</p>
          <pre className="max-h-48 overflow-auto rounded-lg bg-gray-950 p-3 text-xs leading-relaxed text-gray-100">
            {JSON.stringify(summary, null, 2)}
          </pre>
        </div>
      )}
    </section>
  );
}
