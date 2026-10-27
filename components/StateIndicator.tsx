"use client";

import type { AgentState } from "@/lib/voice";

const CONFIG: Record<AgentState, { label: string; dot: string; text: string; pulse: boolean }> = {
  idle: { label: "Idle", dot: "bg-gray-400", text: "text-gray-600", pulse: false },
  connecting: { label: "Connecting", dot: "bg-amber-500", text: "text-amber-700", pulse: true },
  listening: { label: "Listening", dot: "bg-blue-500", text: "text-blue-700", pulse: false },
  thinking: { label: "Thinking", dot: "bg-amber-500", text: "text-amber-700", pulse: true },
  speaking: { label: "Speaking", dot: "bg-emerald-500", text: "text-emerald-700", pulse: true },
};

export default function StateIndicator({ state }: { state: AgentState }) {
  const c = CONFIG[state];
  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium ${c.text}`}
      aria-live="polite"
    >
      <span className="relative flex h-2.5 w-2.5">
        {c.pulse && (
          <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${c.dot} opacity-60`} />
        )}
        <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${c.dot}`} />
      </span>
      {c.label}
    </div>
  );
}
