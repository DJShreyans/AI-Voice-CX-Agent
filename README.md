# Aura Skincare — "Aria" AI Voice Support Agent

A browser-based voice customer-support agent for a fictional D2C skincare brand, **Aura Skincare**. Click **Start Call**, talk to **Aria**, and she answers brand/shipping/return/COD questions, looks up the mock orders through a tool call, refuses anything outside policy, and after you hang up leaves a timestamped transcript and a structured JSON call summary.

**Approach in brief:** a modular pipeline — browser speech-to-text (Web Speech API) → NVIDIA NIM LLM with a `get_order_details` tool → browser text-to-speech with an Indian-English voice. The server only ever sees text; the NVIDIA key stays server-side, and the order tool plus policy flags are deterministic code so the model can't invent order data.

---

## Architecture

```
 BROWSER (Chrome / Edge)                              NEXT.JS SERVER (Vercel)
┌─────────────────────────────┐                  ┌──────────────────────────────────┐
│ Mic ─▶ SpeechRecognition    │   text history   │ POST /api/chat                   │
│        (en-IN)  ───────────────────────────────▶│   system prompt + tools ───────────▶ NVIDIA NIM
│                             │                  │   ┌─ model asks get_order_details │   (chat completions,
│ Speaker ◀─ speechSynthesis  │◀──── reply ──────│   │   → lib/orders.ts lookup      │    tool calling)
│            (Indian voice)   │      text        │   └─ result → model → final text  │
│                             │                  │                                  │
│ State pill / transcript     │  full transcript │ POST /api/summary                │
│ Test Orders panel           │─────────────────▶│   strict JSON schema ─────────────▶ NVIDIA NIM
│ Summary card                │◀── summary JSON ─│                                  │
└─────────────────────────────┘                  │ POST /api/order  (order lookup)  │
                                                 │ lib/orders.ts  mock DB           │
                                                 │ lib/prompt.ts  Aria + guardrails │
                                                 └──────────────────────────────────┘
```

**One turn:**

1. `SpeechRecognition` (`en-IN`) listens until the customer finishes a sentence; recognition is paused while Aria speaks so she can't hear herself.
2. `lib/voice.ts` POSTs the text history to `/api/chat`.
3. `/api/chat` calls NVIDIA with the Aria system prompt and the `get_order_details` tool. If the model returns a tool call, the server normalizes the ID, looks the order up in `lib/orders.ts`, feeds the result back, and repeats (max 3 rounds) until the model produces spoken text.
4. The reply text comes back, is shown in the transcript, and is spoken with `speechSynthesis` (Indian-English voice when the OS has one).
5. Listening resumes. State pill: Listening → Thinking → Speaking.

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js (App Router) + TypeScript, deployable on Vercel |
| UI | Tailwind CSS, React client components |
| Speech-to-text | Browser Web Speech API (`SpeechRecognition`, `en-IN`) |
| LLM + tools | NVIDIA NIM (OpenAI-compatible chat completions), default `nvidia/nemotron-3.5-bolt-e4b` |
| Text-to-speech | Browser `speechSynthesis`, prefers an `en-IN` voice (Edge's neural "Neerja" is best) |
| Summary | NVIDIA NIM with strict `json_schema` output, default `nvidia/nemotron-3.5-bolt-e4b` (1.8s vs 8.3s for the 550B model, same 6/6 on `scripts/summary-eval.ts`) |
| Order DB | In-memory mock in `lib/orders.ts` |

## Project structure

```
app/
  page.tsx                 # main UI (call controls, state, transcript, summary)
  layout.tsx
  api/chat/route.ts        # HTTP wrapper for one conversation turn
  api/order/route.ts       # order lookup endpoint (same logic the tool uses)
  api/summary/route.ts     # strict-JSON post-call summary
lib/
  chat.ts                  # NVIDIA chat call, tool loop, guaranteed order lookup
  greeting.ts              # Aria's opening line (spoken by the client, seeded in history)
  orders.ts                # mock orders + order-ID normalization
  prompt.ts                # Aria system prompt + tool definition
  voice.ts                 # speech recognition / synthesis turn loop
components/
  StateIndicator.tsx  OrdersPanel.tsx  Transcript.tsx  SummaryCard.tsx
scripts/
  eval.ts                  # 16-scenario behaviour eval (npm run eval)
.env.example
```

## Automated behaviour eval

Voice agents regress silently when the prompt or model changes, so `npm run eval` replays 16 scripted customer scenarios from the brief through the *same* code the app uses (`lib/chat.ts`, the real prompt, tool and mock orders) and checks each reply: correct tool call, policy verdict, no invented data, brevity, no markdown. Pass `npm run eval -- <model-a> <model-b>` to compare models.

| Model | Result | Latency / scenario |
|---|---|---|
| `nvidia/nemotron-3.5-bolt-e4b` (default) | 16/16 (two runs) | ~0.7s |
| `nvidia/nemotron-3.5-lightning-30b-a3b` | 14/16 | ~8.7s (up to 35s) |

The first version of the prompt scored 9/16 on the small model: it re-greeted instead of answering, asked for order IDs the customer had already given, and skipped the tool for returns/cancellations. The fixes were removing the stale "first message is a greeting" instruction, telling the model to look up any stated order number immediately, and moving the lookup for explicit order mentions into code. The eval checks policy wording with regexes, so it is a regression guard, not proof of perfect behaviour.

## Setup & run

```bash
npm install
cp .env.example .env.local        # then paste your real NVIDIA_API_KEY
npm run dev                       # http://localhost:3000
```

- Use **Chrome or Edge** (Firefox does not implement speech recognition). Mic access needs **HTTPS or localhost**, and Chrome's recognizer needs an internet connection.
- Click **Start Call**, allow the microphone, wait for Aria's greeting, then talk. Speak after she finishes — she listens after each reply.
- The **Test Orders Helper** panel lists ORD-101, ORD-102 and ORD-103 with their details.
- Click **End Call** to see the transcript and the JSON summary.

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `NVIDIA_API_KEY` | — (required) | Server-side only. Never shipped to the browser. |
| `NVIDIA_CHAT_MODEL` | `nvidia/nemotron-3.5-bolt-e4b` | Live conversation model (needs tool calling, low latency). |
| `NVIDIA_SUMMARY_MODEL` | `nvidia/nemotron-3.5-bolt-e4b` | Post-call JSON summary model. |

## Deploy to Vercel

1. Push this folder to a GitHub repo.
2. On [vercel.com](https://vercel.com) → **Add New Project** → import the repo (Next.js is auto-detected).
3. **Settings → Environment Variables** → add `NVIDIA_API_KEY` (plus optional model overrides). Never prefix it with `NEXT_PUBLIC_`.
4. Deploy. The production URL is HTTPS, so mic access works.

## How tool calling works

1. `lib/prompt.ts` defines `get_order_details(order_id)`; `/api/chat` sends it with `tool_choice: "auto"`.
2. The system prompt says: for anything about a specific order, get the ID first, then call the tool before answering, so the model decides when to call it (this covers spoken forms like "one zero one").
3. As a safety net, `lib/chat.ts` also detects an explicit mention such as "ORD 101" / "order number 102" in the customer's message and runs the lookup itself *before* the model replies, handing it the result. Small models sometimes skip the call or ask for an ID they were already given; this makes that impossible and guarantees "order not found" is answered from real tool output.
4. `/api/chat` receives any further `tool_calls`, normalizes the ID (`"ORD 101"`, `"order 101"`, `"ord101"`, `"1 0 1"`, `"101"` → `ORD-101`) and looks it up in `lib/orders.ts`.
5. The result is `{ found: true, order }` — including derived policy fields (`cancellable`, `returnable`, `days_since_delivery`, return-window notes) so the model reads the verdict instead of computing it — or `{ found: false, error: "ORDER_NOT_FOUND" | "MISSING_ORDER_ID" }`.
6. It goes back to the model as a `tool` message and the model produces the spoken reply. If the tool says not found, she asks the customer to repeat or verify.

## How guardrails are implemented

- **Grounding:** the prompt forbids inventing order data; the only path to order info is the tool, and eligibility comes from deterministic flags in the tool result.
- **Policy enforcement:** the prompt encodes the exact rules (7-day unopened return window, 48-hour damage reports, cancellation only while Processing, COD ≤ ₹2,500, free shipping above ₹499 else ₹50) and "never promise exceptions, discounts, or refunds outside policy".
- **Scope control:** out-of-scope requests (flights, other brands, general knowledge) get a polite refusal; attempts to change her instructions are ignored.
- **Honesty about capabilities:** she can't actually cancel orders, so she says an order is *eligible* and will be *confirmed/processed*, never "done".
- **Unclear speech:** the prompt tells her that input is speech-recognition text that may be misheard, to ask the customer to repeat rather than guess, and to read order IDs back when unsure.
- **Key safety:** the API key is server-side only; the browser never talks to NVIDIA.

## Test script — example conversations

| # | Say | Expect |
|---|---|---|
| 1 | "Hi, where is my order ORD 101?" | BlueDart tracking, out for delivery, expected by 6 PM today. |
| 2 | "Actually, cancel ORD-101 please." | Refuses: can't cancel once out for delivery; suggests refusing the package at the doorstep. |
| 3 | "I want to return my sunscreen, order 102." | Checks the tool (14 days since delivery) → outside the 7-day window, politely declines. |
| 4 | "I bought this 20 days ago and have opened it. Can I return it?" | Explains it falls outside the return policy; no refund promise. |
| 5 | "Please cancel order 103." | Confirms it's Processing → eligible; says it will be confirmed/processed (not already done). |
| 6 | "Track order 999 for me." | Tool returns not-found → "couldn't locate that order, please repeat or verify the ID." No invented data. |
| 7 | "Where's my order?" (no ID) | Asks for the order ID; never guesses. |
| 8 | "Book me a flight to Goa." | Politely says she can only help with Aura Skincare queries. |
| 9 | Mumble, or "my order number is… one… uh…" | Asks you to repeat before looking anything up. |
| 10 | "Is COD available?" / "Shipping charges?" | COD up to ₹2,500 by cash/UPI at the doorstep; free above ₹499, else ₹50; 3–5 business days. |

Also verify: the state pill (Listening / Thinking / Speaking), customer + Aria transcript with timestamps, summary JSON after End Call, the **Copy JSON** button, and the error banner when mic permission is denied.

## Known limitations

- No barge-in: Aria can't be interrupted mid-sentence (recognition is paused while she speaks to avoid echo).
- Chrome/Edge only; voice quality and accent depend on the voices installed on the evaluator's OS.
- Hinglish is understood by the model but recognition runs in `en-IN`, so heavily Hindi speech may be transcribed poorly.

---

# Tell Us How You Think

### 1. Why this architecture and stack

I built a modular pipeline — browser STT → NVIDIA NIM LLM with tool calling → browser TTS — because it keeps the interesting part (reasoning, tools, guardrails) on the server in plain text where I can see and test it, and keeps the audio part free and zero-latency to the network. The browser's Web Speech API gives streaming recognition and an Indian-English voice with no extra vendor, key, or per-minute cost, which suits a take-home that must be publicly testable on a free tier. NVIDIA NIM exposes an OpenAI-compatible chat endpoint with function calling, so the tool loop is a few lines of server code, and the model is swappable with one environment variable (I measured several: the small `nemotron-3.5-bolt-e4b` answers in ~0.7s, while the 550B model takes ~3.7s per call and ~8s for the summary, so I used the small model for both after checking its summary labels with a scripted eval).

The trade-off is voice quality and control: the browser voice is more robotic than a neural TTS, recognition quality depends on Chrome's service, and I can't do barge-in cleanly without echo cancellation across the TTS/STT boundary. With more time I'd swap the two browser pieces for a streaming STT and neural TTS — the server contract (`text in, text out`) wouldn't change.

### 2. Most difficult part, and how I solved it

**Keeping the agent honest.** It's tempting to let the model "helpfully" normalize `ORD 101` or work out whether a return is allowed — then it will also confidently invent `ORD-105` or a refund. I pushed all of that into deterministic code: ID normalization in `lib/orders.ts`, and eligibility flags (`cancellable`, `returnable`, `days_since_delivery`) precomputed in the tool result so the model only reads a verdict. The prompt then forbids anything outside the tool result and the written policies.

**Model availability and latency.** Several models in the provider's catalog were listed but retired or not callable on my account, and the largest ones were too slow for voice. I tested candidates for tool calling, JSON-schema output, and per-call latency, and chose different models for the live turn (fast) and the summary (accurate, off the critical path).

**Turn-taking without a realtime API.** Browser recognition ends on silence, so I restart it between turns, pause it while Aria speaks (so she doesn't transcribe herself), and drop a failed user turn from history so roles keep alternating.

### 3. What I'd improve with one more week

- **Streaming and barge-in:** stream the LLM response and speak sentence-by-sentence to cut perceived latency, and add interruption using a streaming STT with echo cancellation.
- **Better voice:** neural TTS with a consistent Indian accent across browsers instead of whatever voices the OS ships.
- **Real actions:** a `cancel_order` tool behind OTP verification so "eligible" becomes "done, here's your confirmation".
- **Automated evals:** script the ten test conversations as text turns against `/api/chat` and grade tool-call correctness, policy verdicts, and no hallucinated IDs, run in CI so prompt or model changes can't silently regress.
- **Latency instrumentation:** per-turn timing (speech end → reply text → first audio) with p50/p90.

### 4. What changes at 1,000 conversations/day

- **Rate limits and cost:** the free tier won't hold; I'd move to a paid inference plan with retries/backoff and a fallback model, log tokens per call, and set a spend ceiling with graceful degradation.
- **Reliability of speech:** browser STT is fine for a demo but not an SLA; I'd use a managed streaming STT/TTS (or telephony provider) with monitoring.
- **Observability and evals:** a call ID on every turn, structured logs of tool calls and latencies, and a nightly replay of recorded scenarios against prompt changes before deploy.
- **PII:** names and order details flow through transcripts, so encrypt at rest, auto-expire, redact PII in analytics, and cover third-party processing in the privacy policy.
- **Real order API with verification:** replace the mock DB with an authenticated backend, and verify identity (phone/OTP) before revealing any order contents.
- **Human escalation:** detect repeated misrecognition, anger, or failed lookups, and hand off with a ticket containing the transcript and structured summary.
