"use client";

import { useEffect, useRef } from "react";
import type { TranscriptEntry } from "@/lib/voice";

function fmt(at: number): string {
  return new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export default function Transcript({ entries }: { entries: TranscriptEntry[] }) {
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [entries.length]);

  return (
    <section className="flex min-h-0 flex-1 flex-col rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <h2 className="mb-2 text-base font-semibold text-gray-900">Transcript</h2>
      {entries.length === 0 ? (
        <p className="text-sm text-gray-500">
          No conversation yet. Start a call and speak - the live transcript appears here.
        </p>
      ) : (
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
          {entries.map((e) => (
            <div key={e.id} className="text-sm">
              <div className="flex items-baseline gap-2">
                <span
                  className={`font-semibold ${
                    e.role === "customer" ? "text-blue-700" : "text-emerald-700"
                  }`}
                >
                  {e.role === "customer" ? "Customer" : "Aria"}
                </span>
                <span className="text-xs text-gray-400">{fmt(e.at)}</span>
              </div>
              <p className="mt-0.5 text-gray-700">{e.text}</p>
            </div>
          ))}
          <div ref={endRef} />
        </div>
      )}
    </section>
  );
}
