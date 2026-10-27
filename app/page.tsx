"use client";

import Link from "next/link";
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
    <main className="workspace">
      <header className="topbar">
        <Link className="brand" href="/" aria-label="Aura Skincare home"><span className="brand-mark">aura<span>.</span></span><span className="brand-divider" /><span className="brand-caption">SKINCARE<br />CUSTOMER CARE</span></Link>
        <div className="workspace-label"><span className="small-dot" /> Voice support workspace</div>
      </header>

      <div className="page-heading"><div><h1>A little care. A real conversation.</h1><p>Meet Aria, your voice assistant for everything after checkout.</p></div><span className="demo-label">Demo workspace</span></div>

      {error && <div className="error-banner" role="alert"><span>{error}</span><button onClick={() => setError(null)}>Dismiss</button></div>}

      <div className="workspace-grid">
        <div className="conversation-column">
          <section className={`call-studio ${phase === "in-call" ? "is-active" : ""}`} aria-labelledby="call-title">
            <div className="studio-top"><span className="studio-label">YOUR VOICE ASSISTANT</span><StateIndicator state={agentState} /></div>
            <div className="voice-visual" aria-hidden="true"><div className="voice-orbit orbit-one" /><div className="voice-orbit orbit-two" /><div className="voice-core"><svg viewBox="0 0 48 48" fill="none"><path d="M14 20v8m7-15v22m7-27v32m7-23v14" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg></div></div>
            <h2 id="call-title">{phase === "in-call" ? "Aria is here for you." : phase === "ended" ? "Thanks for stopping by." : "Good care starts with a hello."}</h2>
            <p className="studio-description">{phase === "in-call" ? "Take your time. Speak after Aria finishes her reply." : phase === "ended" ? "Your conversation and summary are ready to review below." : "Order updates, returns, or a quick question. Just ask Aria, in your own words."}</p>
            <button className={`call-button ${phase === "in-call" ? "end-call" : ""}`} onClick={phase === "in-call" ? finishCall : startCall} disabled={busy}>
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2c0 8.84 7.16 16 16 16a2 2 0 0 0 2-2v-3l-5-2-2 2a14 14 0 0 1-6-6l2-2-2-5Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /></svg>
              {phase === "in-call" ? "End call" : busy ? "Connecting…" : phase === "ended" ? "Start a new call" : "Talk to Aria"}
            </button>
            <p className="mic-note">{busy ? "Allow microphone access to connect with Aria." : "Microphone access required · Best in Chrome or Edge"}</p>
            <div className="support-topics"><span>Order tracking</span><span>Returns & refunds</span><span>Cancellations</span><span>Shipping & COD</span></div>
          </section>
          <Transcript entries={transcript} />
          <SummaryCard summary={summary} loading={summaryLoading} error={summaryError} />
        </div>
        <aside className="reference-column"><OrdersPanel /><div className="quick-guide"><h3>A first conversation?</h3><ol><li>Start a call and allow your microphone.</li><li>Wait for Aria’s greeting, then speak.</li><li>Keep an order ID handy for order questions.</li></ol><p>Try saying: <q>Where is my order ORD-101?</q></p></div></aside>
      </div>
      <footer className="page-footer"><span>Thoughtful skincare. Thoughtful support.</span><span>Aura Skincare × Aria</span></footer>
    </main>
  );
}
