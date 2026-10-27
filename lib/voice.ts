// Browser-side voice loop for Aria, built on the Web Speech API (no audio ever
// leaves the browser; only text goes to our server).
//
// Turn cycle:
//  1. SpeechRecognition listens until the customer finishes a sentence.
//  2. The text history is POSTed to /api/chat (NVIDIA NIM + order lookup tool).
//  3. Aria's reply is spoken with speechSynthesis, then we listen again.
// Recognition is paused while Aria speaks so she doesn't hear herself.

export type AgentState = "idle" | "connecting" | "listening" | "thinking" | "speaking";

export interface TranscriptEntry {
  id: string;
  role: "customer" | "aria";
  text: string;
  at: number;
}

export interface AriaCallbacks {
  onState: (state: AgentState) => void;
  onCustomerUtterance: (text: string) => void;
  onAriaUtterance: (text: string) => void;
  onError: (message: string, fatal: boolean) => void;
}

export class CallStartError extends Error {
  kind: "mic" | "unsupported";
  constructor(kind: CallStartError["kind"], message: string) {
    super(message);
    this.kind = kind;
  }
}

// Minimal Web Speech API typings (not part of lib.dom in all TS versions).
interface SpeechRecognitionAlternativeLike {
  transcript: string;
}
interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: SpeechRecognitionAlternativeLike;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  abort(): void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getRecognitionCtor(): SpeechRecognitionCtor | undefined {
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

const GREETING = "Hello! I'm Aria from Aura Skincare. How can I help you today?";
const LANG = "en-IN";

interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

function pickVoice(): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices();
  const indian = voices.filter((v) => v.lang.replace("_", "-") === LANG);
  return (
    indian.find((v) => /neerja|natural/i.test(v.name)) ?? // Edge's neural Indian-English voice
    indian.find((v) => /female|heera|veena|google/i.test(v.name)) ??
    indian[0] ??
    voices.find((v) => v.lang.startsWith("en"))
  );
}

export class AriaCall {
  private cb: AriaCallbacks;
  private Recognition: SpeechRecognitionCtor;
  private recognition: SpeechRecognitionLike | null = null;
  private history: ChatTurn[] = [];
  private closed = false;
  private busy = false;

  private constructor(cb: AriaCallbacks, Recognition: SpeechRecognitionCtor) {
    this.cb = cb;
    this.Recognition = Recognition;
  }

  static async start(cb: AriaCallbacks): Promise<AriaCall> {
    const Recognition = getRecognitionCtor();
    if (!Recognition || !("speechSynthesis" in window)) {
      throw new CallStartError(
        "unsupported",
        "This browser does not support speech recognition. Please use Chrome or Edge.",
      );
    }

    // Ask for the mic up front so a permission problem surfaces as a clear error.
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        throw new CallStartError(
          "mic",
          "Microphone access was denied. Allow mic permission in your browser settings and try again.",
        );
      }
      if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        throw new CallStartError("mic", "No microphone was found. Please connect one and try again.");
      }
      if (name === "NotReadableError" || name === "TrackStartError") {
        throw new CallStartError(
          "mic",
          "Your microphone seems to be in use by another app. Close it and try again.",
        );
      }
      throw new CallStartError("mic", "Could not access the microphone. Please try again.");
    }

    const call = new AriaCall(cb, Recognition);
    void call.greet();
    return call;
  }

  private setState(s: AgentState) {
    if (!this.closed) this.cb.onState(s);
  }

  private async greet() {
    this.history.push({ role: "assistant", content: GREETING });
    this.cb.onAriaUtterance(GREETING);
    await this.speak(GREETING);
    this.listen();
  }

  private listen() {
    if (this.closed) return;
    this.setState("listening");

    const rec = new this.Recognition();
    this.recognition = rec;
    rec.lang = LANG;
    rec.continuous = false;
    rec.interimResults = false;

    let heard = "";
    let fatal = false;

    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) heard += e.results[i][0].transcript + " ";
      }
    };

    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        fatal = true;
        this.cb.onError("Microphone / speech recognition permission was denied.", true);
      } else if (e.error === "network") {
        fatal = true;
        const brave = (navigator as unknown as { brave?: unknown }).brave !== undefined;
        this.cb.onError(
          brave
            ? "Brave does not support speech recognition. Please open this page in Chrome or Edge."
            : "The browser's speech service could not be reached. Use Chrome (or Edge with Windows Settings > Privacy > Speech > Online speech recognition turned on), and turn off any VPN, proxy or ad-blocker for this page.",
          true,
        );
      }
      // "no-speech" and "aborted" are normal; onend restarts listening.
    };

    rec.onend = () => {
      if (this.closed || fatal || this.recognition !== rec) return;
      const text = heard.trim();
      if (text) {
        void this.handleUtterance(text);
      } else {
        this.listen(); // silence timeout - keep the call open
      }
    };

    try {
      rec.start();
    } catch {
      // start() throws if a previous session hasn't fully ended yet; retry shortly.
      setTimeout(() => this.listen(), 300);
    }
  }

  private async handleUtterance(text: string) {
    if (this.busy) return;
    this.busy = true;
    this.cb.onCustomerUtterance(text);
    this.history.push({ role: "user", content: text });
    this.setState("thinking");

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: this.history }),
      });
      const data: unknown = await res.json().catch(() => undefined);
      const rec = typeof data === "object" && data !== null ? (data as Record<string, unknown>) : {};
      const reply = typeof rec["reply"] === "string" ? rec["reply"] : "";
      if (!res.ok || !reply) {
        const msg = typeof rec["error"] === "string" ? rec["error"] : `HTTP ${res.status}`;
        throw new Error(msg);
      }
      if (this.closed) return;

      this.history.push({ role: "assistant", content: reply });
      this.cb.onAriaUtterance(reply);
      await this.speak(reply);
    } catch (err) {
      // Drop the unanswered user turn so the history keeps alternating roles.
      this.history.pop();
      this.cb.onError(`Aria could not respond: ${err instanceof Error ? err.message : "unknown error"}`, false);
    } finally {
      this.busy = false;
      this.listen();
    }
  }

  private speak(text: string): Promise<void> {
    return new Promise((resolve) => {
      if (this.closed) return resolve();
      this.setState("speaking");
      const u = new SpeechSynthesisUtterance(text);
      u.lang = LANG;
      const voice = pickVoice();
      if (voice) u.voice = voice;
      u.rate = 1.0;
      u.onend = () => resolve();
      u.onerror = () => resolve();
      window.speechSynthesis.speak(u);
    });
  }

  cleanup() {
    this.closed = true;
    const rec = this.recognition;
    this.recognition = null;
    try {
      rec?.abort();
    } catch {
      /* already stopped */
    }
    window.speechSynthesis.cancel();
  }

  end() {
    if (this.closed) return;
    this.cleanup();
    this.cb.onState("idle");
  }
}
