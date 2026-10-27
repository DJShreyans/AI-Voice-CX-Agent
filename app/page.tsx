"use client";

import { useCallback, useRef, useState } from "react";
import OrdersPanel from "@/components/OrdersPanel";
import StateIndicator from "@/components/StateIndicator";
import SummaryCard, { type CallSummary } from "@/components/SummaryCard";
import Transcript from "@/components/Transcript";
import { AriaCall, type AgentState, type TranscriptEntry } from "@/lib/voice";

type Phase = "idle" | "connecting" | "in-call" | "ended";

export default function Home() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [agentState, setAgentState] = useState<AgentState>("idle");
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<CallSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const callRef = useRef<AriaCall | null>(null);
  const transcriptRef = useRef<TranscriptEntry[]>([]);
  const finalizingRef = useRef(false);

  const addEntry = useCallback((role: TranscriptEntry["role"], text: string) => {
    const entry: TranscriptEntry = {
      id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      role,
      text,
      at: Date.now(),
    };
    transcriptRef.current = [...transcriptRef.current, entry];
    setTranscript(transcriptRef.current);
  }, []);

  const requestSummary = useCallback(async () => {
    setSummaryLoading(true);
    setSummaryError(null);
    setSummary(null);
    try {
      const res = await fetch("/api/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: transcriptRef.current }),
      });
      const data: unknown = await res.json().catch(() => undefined);
      const rec = typeof data === "object" && data !== null ? (data as Record<string, unknown>) : {};
      if (!res.ok) {
        const msg = typeof rec["error"] === "string" ? rec["error"] : `HTTP ${res.status}`;
        throw new Error(msg);
      }
      setSummary({
        customer_intent: String(rec["customer_intent"] ?? "OTHER"),
        order_id: (rec["order_id"] as string | null) ?? null,
        resolution_status: String(rec["resolution_status"] ?? "UNRESOLVED"),
        call_summary: String(rec["call_summary"] ?? ""),
      });
    } catch (err) {
      setSummaryError(
        `Could not generate the summary${err instanceof Error ? `: ${err.message}` : "."}`,
      );
    } finally {
      setSummaryLoading(false);
    }
  }, []);

  const finishCall = useCallback(() => {
    if (finalizingRef.current) return;
    finalizingRef.current = true;
    callRef.current?.end();
    callRef.current = null;
    setPhase("ended");
    setAgentState("idle");
    void requestSummary();
  }, [requestSummary]);

  const startCall = useCallback(async () => {
    setError(null);
    setSummary(null);
    setSummaryError(null);
    transcriptRef.current = [];
    setTranscript([]);
    finalizingRef.current = false;
    setPhase("connecting");
    setAgentState("connecting");

    try {
      const call = await AriaCall.start({
        onState: setAgentState,
        onCustomerUtterance: (text) => addEntry("customer", text),
        onAriaUtterance: (text) => addEntry("aria", text),
        onError: (message, fatal) => {
          setError(message);
          if (fatal) finishCall();
        },
      });
      callRef.current = call;
      setPhase("in-call");
    } catch (err) {
      callRef.current = null;
      setPhase("idle");
      setAgentState("idle");
      setError(err instanceof Error ? err.message : "Could not start the call.");
    }
  }, [addEntry, finishCall]);

  const busy = phase === "connecting";

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-4 px-4 py-6">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-gray-900">
            Aura Skincare <span className="font-normal text-gray-400">·</span> Aria Voice Support
          </h1>
          <p className="text-sm text-gray-500">
            Talk to Aria about your order, delivery, cancellation, return, or COD questions.
          </p>
        </div>
        <StateIndicator state={phase === "idle" && agentState === "idle" ? "idle" : agentState} />
      </header>

      {error && (
        <div className="flex items-start justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="shrink-0 font-medium underline">
            Dismiss
          </button>
        </div>
      )}

      <div className="grid flex-1 gap-4 lg:grid-cols-[1fr_340px]">
        <div className="flex min-h-0 flex-col gap-4">
          <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-3">
              {phase === "in-call" ? (
                <button
                  onClick={finishCall}
                  className="rounded-lg bg-rose-600 px-5 py-2.5 font-medium text-white transition hover:bg-rose-700"
                >
                  End Call
                </button>
              ) : (
                <button
                  onClick={startCall}
                  disabled={busy}
                  className="rounded-lg bg-emerald-600 px-5 py-2.5 font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy ? "Connecting…" : "Start Call"}
                </button>
              )}
              <p className="text-sm text-gray-500">
                {phase === "idle" && "Grant mic access when the browser asks, then just talk."}
                {busy && "Asking for mic permission and connecting to Aria…"}
                {phase === "in-call" && "Speak when Aria is done talking - she listens after each reply."}
                {phase === "ended" && "Call ended. Review the transcript and summary below."}
              </p>
            </div>
          </section>

          <Transcript entries={transcript} />

          <SummaryCard summary={summary} loading={summaryLoading} error={summaryError} />
        </div>

        <div className="flex flex-col gap-4">
          <OrdersPanel />
        </div>
      </div>
    </main>
  );
}
