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
    <section className="transcript-panel panel">
      <div className="panel-heading"><h2>Live transcript</h2><span className="panel-meta">{entries.length} messages</span></div>
      {entries.length === 0 ? (
        <div className="transcript-empty"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 4h14v12H9l-4 4V4Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/><path d="M9 8h6m-6 4h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg><p>A space for your conversation.</p><span>Your words and Aria’s replies will appear here as you talk.</span></div>
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
