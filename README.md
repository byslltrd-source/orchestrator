# Orchestrator

Your Personal AI Command Center with vision, user accounts, and subscription-based access.

## Features

- **User accounts** — Email + password sign up / log in (powered by Supabase Auth)
- **Subscription based** — Free tier (20 orchestrations/month, single image) vs Pro (unlimited + multi-image vision)
- **Vision** — Attach one or more images. Task + images are sent together to the model using `detail: high`
- **Usage tracking & enforcement** — Server-side quota checks + automatic monthly reset for free users
- **Stripe billing** — Checkout + Customer Portal + webhook sync

## Getting Started

### 1. Environment

```bash
cp .env.example .env.local
```

Fill in:

- `OPENAI_API_KEY` (or provider-specific keys — see Multiple AIs below)
- Supabase keys (see below)
- Stripe keys + price ID (see below)

### 2. Run over HTTPS (Required for Real-time Vision / Camera Testing)

The full test experience (especially **Real-time Vision**, **Physical World Integration**, **Emotional Awareness**, and **Personal Life OS Mode**) requires a secure context for browser camera access (`getUserMedia`).

```bash
npm run dev
```

This starts the app at **https://localhost:3000** (or the port shown) using the provided self-signed certificates in `/certificates/`.

- Accept the browser security warning for the self-signed cert (or trust the cert in your OS keychain for a cleaner experience).
- The main page at `/` is the complete test interface:
  - Composer with all toggles (Model picker, Real-time Vision, Physical/Smart Home, Emotional Awareness, Life OS Mode)
  - Live camera preview when Real-time Vision is enabled
  - Live execution trace + full history
  - One-shot and autonomous modes

Alternative (plain HTTP, limited camera):
```bash
npm run dev:http
```

**Note on Windows**: You may need to run PowerShell as Administrator the first time or manually trust the localhost certs for no warnings. The camera features will still work on `localhost` even with warnings in most browsers.

### Testing Error Pages (500)

To test the custom 500 error page (the design from 500-error.html):

1. Run the app over HTTPS:
   ```bash
   npm run dev
   ```
   Open https://localhost:3000

2. To trigger a middleware-level 500 (MIDDLEWARE_INVOCATION_FAILED style):
   - Temporarily rename or empty your `.env.local` Supabase keys.
   - Refresh any page. You should see the nice branded error box.

3. To trigger a React/runtime 500 (caught by global-error.tsx):
   - Visit https://localhost:3000/api/test-500
   - Or, in Life OS Mode / Physical Integration with bad config, force an error during a run.

The error pages are dark-themed to match the rest of the Orchestrator UI and include the error code + a unique ID for debugging.

### 2. Supabase Setup (Accounts)

1. Create a new Supabase project at https://supabase.com
2. Go to **SQL Editor** and run the entire contents of `supabase/schema.sql`
3. Copy:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` public key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key (keep secret!) → `SUPABASE_SERVICE_ROLE_KEY`
4. (Dev only) Authentication → Providers → Email → turn **off** "Confirm email" so you can sign up instantly.

### 3. Stripe Setup (Subscriptions)

1. Create a product in Stripe called **"Orchestrator Pro"** (recurring monthly).
2. Copy the **Price ID** (starts with `price_...`) into `STRIPE_PRICE_PRO`.
3. Add your `STRIPE_SECRET_KEY` (test or live).
4. Create a webhook in Stripe pointing to:
   `https://your-domain.com/api/stripe/webhooks`
   - Events to listen for: `checkout.session.completed`, `customer.subscription.*`, `invoice.payment_succeeded`
   - Copy the **Signing secret** (`whsec_...`) into `STRIPE_WEBHOOK_SECRET`.

For local development you can use the Stripe CLI:
```bash
stripe login
stripe listen --forward-to localhost:3000/api/stripe/webhooks
```

### 4. Run

```bash
npm install
npm run dev
```

Open http://localhost:3000

Sign up (free), try orchestrating with/without images, then click **Upgrade** to test the full Pro flow.

## Tech Stack

- Next.js 16 + App Router + Turbopack
- React 19 + Tailwind
- Supabase (Auth + Postgres + RLS)
- Stripe (Checkout, Portal, Webhooks)
- Multiple LLMs for the orchestrator (OpenAI, Grok/xAI, Claude via OpenRouter, Groq, Ollama, OpenRouter, custom OpenAI-compatible endpoints) — pick per run in the UI!

## Key Files

- `app/api/orchestrate/route.ts` — protected, usage-gated, multi-image vision endpoint
- `app/api/stripe/*` — checkout, portal, webhook handler
- `lib/supabase/*` — server, browser, service-role, and middleware clients
- `middleware.ts` — session refresh for SSR auth
- `components/{Header,AuthModal}.tsx`
- `supabase/schema.sql` — profiles table + trigger + RLS

## Notes / Future Ideas

- Multi-image vision is currently a Pro-only feature (enforced on client + server).
- The "orchestrator" can be extended with tools, memory, multi-step planning, different models per tier, etc.
- Add usage history table if you want a full audit log of every call.

## Deployment

- Vercel (recommended)
- Add all the same env vars in Vercel dashboard
- Set `NEXT_PUBLIC_SITE_URL` to your production domain
- Stripe webhook URL must be your production domain + `/api/stripe/webhooks`

## Next Layer Improvements (Implemented)
- Zod schemas + validation for inputs and tool args.
- Full manual `Database` types for Supabase (stronger typing, reduced `any`).
- Component extraction (OrchestratorComposer, StepRenderer) + moved types out of giant page.
- Enhanced storage layer (lib/supabase/storage.ts): user-scoped uploads to configurable bucket (default 'orchestrator-images'), rich StoredAsset metadata (path, url, name, size, mime), support for public + signed URLs, helpers for upload/delete/list. Used for vision inputs (replaces base64). Create the bucket in Supabase dashboard.
- Agent resume support (loads previous steps, reconstructs conversation for continuation).
- Usage/audit history table (`usage_events`) + logging on every call.
- Basic rate limiting in API.
- Tests setup (Vitest) + example schema tests.
- See supabase/schema.sql for new table; run it to apply.

## Copyright & License

© 2026 [Your Name or Company]. All rights reserved.

This project contains proprietary code. When purchasing or receiving a licensed copy (e.g. as a starter kit), you are granted rights only under the accompanying Commercial License Agreement.

See the `LICENSE` file in the root of the repository for the full copyright notice and license terms.

Do not redistribute the source code without a valid license.

---

See previous vision work in `app/api/orchestrate/route.ts` and the multi-image UI in `app/page.tsx`.

## Autonomous Mode (New)

Users (on Pro) can check "Run autonomously". The agent will:
- Use tools (web search via Tavily, page browsing, memory recall/save, self-planning)
- Run a multi-step loop until it decides it's done
- Return + persist a full execution trace (thoughts + every tool call + results)

All autonomous executions are saved as:
- `tasks` (the goal)
- `agent_runs` (one execution)
- `agent_steps` (detailed log)

This is how **you watch** what the agents are doing across your users, and how users come back to review what their agent did.

The "Recent Autonomous Runs" section in the UI lets users (and you via the DB) browse and re-view traces.

**Required**:
- Run the latest `supabase/schema.sql`
- Set `TAVILY_API_KEY` for the agent to do real web research

Free tier is limited to one-shot calls. Autonomous + tools + persistent memory/history is the main Pro value.

## Multiple AIs for the Orchestrator + Real-time Vision (Premium)

You can now power the agent with many different models, not just OpenAI:

- Built-in presets: GPT-4o / 4o-mini, Grok (xAI), Claude 3.5 Sonnet / Opus (via OpenRouter), Groq (Llama 70B etc.), Ollama (local), OpenRouter (any), and a fully custom entry.
- Choose the model in the UI dropdown for every orchestration (one-shot or autonomous).
- The autonomous agent loop, tool calling, vision (when supported by the model), and internal helpers all respect your choice.
- Add / tweak models in `lib/ai/models.ts` (very easy to extend with new base URLs and keys).
- Use environment variables for keys:
  - `XAI_API_KEY` for Grok presets
  - `GROQ_API_KEY` for Groq
  - `OPENROUTER_API_KEY` for Claude/Gemini/etc via OpenRouter
  - `ORCHESTRATOR_API_KEY` + `ORCHESTRATOR_BASE_URL` + `ORCHESTRATOR_MODEL` for anything OpenAI-compatible (including self-hosted vLLM, LM Studio, LiteLLM proxy, corporate gateways, etc.)

Embeddings for memory stay on a cheap OpenAI-compatible embedder by default (you can override with `EMBEDDING_*` vars).

**Real-time Vision (Premium top-tier only, opt-in, expensive):**
Premium subscribers can opt-in per autonomous run to let the agent see live camera frames from the user's device ("the AI that can see in real time"). Frames are pushed by the customer (manual or low-frequency auto) and injected into the agent's context between turns. 

**Warning**: This feature is deliberately expensive (high-detail vision tokens + context bloat). It is opt-in only, rate-limited on the server, and comes with prominent cost warnings in the UI. The system prompt informs the agent about live vision updates when the customer opts in.

**Physical World Integration + Smart Home Bridge (Premium + Real-time Vision opt-in, EXTREMELY expensive + risky):**
This is the full **digital ↔ physical bridge**.

The agent has:
- Eyes → Real-time live camera (Premium opt-in)
- Sensors + Hands → New tools:
  - `read_physical_sensor`
  - `execute_smart_home_action` (full smart home control — lights, locks, climate, scenes, media, alarms, etc. using Home Assistant-style domains)
  - `bridge_digital_to_physical` (reason across digital sources like calendar/weather/memory + live camera + physical sensors → decide and safely execute real actions)

**Smart Home is the killer application** ("BRIDGES DIGITAL AND PHYSICAL, SMART HOME APPLICATION AND ALL"):
- "Calendar says meeting. Camera + motion sensor sees someone at door → turn on porch light + lock side door."
- "Outdoor temp sensor + web weather → close blinds and adjust AC via smart home."
- Agent can use any combination of web tools, memory, and live vision to drive physical changes.

Controller: `PHYSICAL_CONTROLLER_URL` (Home Assistant REST API is excellent). Per-run override supported in UI. Works for smart home + "AND ALL" (robots, printers, industrial IoT, etc.).

**Critical warnings**: Real physical consequences. Agent is instructed to always ground actions in live camera. Heavy limits, dry_run, per-run explicit opt-in + Premium required.

**Emotional State Awareness (Premium):**
Agent tracks emotional state from conversation text and live camera (expressions, posture, energy via vision summarizer). Logs to memory with `analyze_emotional_state` and `log_emotional_state`. Responds with appropriate empathy and can trigger supportive physical actions (e.g. lighting, music).

**Personal Life OS Mode (Premium):**
The agent operates as your full **Personal Life Operating System**. Holistic, proactive management of emotions, physical environment (smart home + sensors), digital life, habits, goals, and overall well-being.

Special tools: `personal_life_reflection`, `suggest_life_os_action`, `bridge_digital_to_physical`.

Example behavior: Notices stress from camera + full calendar → suggests physical environment adjustment + a realistic plan that respects your energy and emotional state.

All of the above (multiple AIs, real-time vision, physical/smart home, emotional awareness, Life OS) can be combined in a single autonomous run. The more premium features you opt into, the more capable and context-aware your personal AI becomes.

