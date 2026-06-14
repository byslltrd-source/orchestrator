# Orchestrator

Your Personal AI Command Center with vision, user accounts, and subscription-based access.

## Features

- **User accounts** — Email + password sign up / log in (powered by Supabase Auth)
- **Subscription based** — Free tier (20 orchestrations/month, single image) vs Pro (unlimited + multi-image vision)
- **Vision** — Attach one or more images. Task + images are sent together to the model using `detail: high`
- **Usage tracking & enforcement** — Server-side quota checks + automatic monthly reset for free users
- **Stripe billing** — Checkout + Customer Portal + webhook sync
- **Proprietary Features** — Proprietary Ultra tier includes exclusive native IP as core part of Orchestrator: Policy Translation Engine, Constituent Emotion Layering, Knowledge Heat Map, Invisible Workflow Weaver, Opportunity Decay Clock + the flagship Orchestra Tool (detailed below)

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

### Vercel + Supabase Integration (Recommended)

The easiest and most reliable way to deploy Orchestrator is to **Vercel** combined with the **official Supabase Vercel Integration**. This automatically keeps your Supabase environment variables (URL, anon key, etc.) in sync across your Vercel projects and previews — no manual copying needed.

See the integration UI mockup in `versel-supabase-integration.html` for what the connection screen looks like in the Vercel dashboard.

#### Step-by-step

1. **Push your code** to GitHub (or GitLab/Bitbucket).

2. **Import to Vercel**:
   - Go to [vercel.com/new](https://vercel.com/new)
   - Import your repository.
   - Vercel will auto-detect it's a Next.js app.

3. **Add the Supabase Vercel Integration** (this is the magic):
   - In your Vercel project dashboard → **Integrations** tab.
   - Search for and install **Supabase**.
   - Connect your Supabase organization.
   - Select your Supabase project (the one you used for local development).
   - Link your Vercel project (and optionally other Vercel projects/teams to the same Supabase project).
   - The integration will automatically inject:
     - `NEXT_PUBLIC_SUPABASE_URL`
     - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - (You will still need to manually add the secret `SUPABASE_SERVICE_ROLE_KEY` in Vercel → Settings → Environment Variables, as it's not exposed by the integration for security. This key is required for the `orchestra_tool` + proprietary tools sync and other privileged operations.)

4. **Add remaining environment variables** in Vercel (Settings → Environment Variables). Copy from your `.env.local` / `.env.example`:
   - `OPENAI_API_KEY` (or `XAI_API_KEY`, `GROQ_API_KEY`, `OPENROUTER_API_KEY`, etc. for the multiple LLM support)
   - `TAVILY_API_KEY` (for web_search tool)
   - `STRIPE_SECRET_KEY`
   - `STRIPE_WEBHOOK_SECRET`
   - `STRIPE_PRICE_PRO`
   - `NEXT_PUBLIC_SITE_URL` → your production Vercel domain (e.g. `https://orchestrator.vercel.app`)
   - Any other custom ones (e.g. `PHYSICAL_CONTROLLER_URL` for the physical world / smart home integration)

   **Important for previews**: Use "Preview" environment for branch deploys. The Supabase integration can automatically create preview projects/databases if you enable that in Supabase.

5. **Deploy**:
   - Vercel will build and deploy.
   - Your production URL will be something like `https://your-project.vercel.app` (or your custom domain).

6. **Stripe Webhooks** (production):
   - In Stripe Dashboard → Developers → Webhooks, add endpoint:
     `https://your-production-domain.com/api/stripe/webhooks`
   - Events: `checkout.session.completed`, `customer.subscription.*`, `invoice.payment_succeeded`
   - Copy the signing secret into `STRIPE_WEBHOOK_SECRET` in Vercel.

7. **Custom Domain (optional)**:
   - In Vercel project → Settings → Domains.
   - Add your domain and follow the DNS instructions.
   - Update `NEXT_PUBLIC_SITE_URL` and Stripe webhook to use the custom domain.

#### Why this integration is great for Orchestrator

- Automatic env var sync → no more "missing Supabase keys" 500 errors in production.
- Works perfectly with the new features:
  - Multiple LLM support (add your OpenAI/Grok/Claude/etc. keys once in Vercel).
  - Real-time vision + Physical World Integration (HTTPS is automatic on Vercel; add your `PHYSICAL_CONTROLLER_URL`).
  - Personal Life OS Mode, Emotional Awareness, etc. (all server-side features just work).
- Preview deployments get their own Supabase project if you configure it.

See the `versel-supabase-integration.html` file in your Downloads for a visual of the connection UI (including the project card, "TEAM" badge, "Manage" button, connection status in the last section showing "byslltrd@gmail.com... orchestrator Connected X minutes ago", etc.).

After connecting, your Vercel project will automatically receive the Supabase environment variables (URL + anon) on every deploy and preview. 

**Important now that bypass mode is removed**: 
- Manually add `SUPABASE_SERVICE_ROLE_KEY` (required for tool syncing and privileged DB ops like the Orchestra Tool and proprietary engines).
- In your Supabase project, run `supabase/schema.sql` (including the new `tools` table) so that the list of tools (orchestra_tool + all proprietary ultra engines) is visible in the deployed UI.
- The middleware will now strictly require the Supabase vars — no more silent bypass.

#### Alternative: Manual env var setup (not recommended)

If you don't use the integration:
- Go to Vercel project → Settings → Environment Variables
- Add every variable from `.env.example` (production + preview environments)
- Still set `NEXT_PUBLIC_SITE_URL` and Stripe webhook.
- Critically: add `SUPABASE_SERVICE_ROLE_KEY` and ensure your Supabase project has run the latest schema.sql (tools table + seeds for orchestra_tool and proprietary ultra tools).

This is error-prone and doesn't auto-update when you rotate Supabase keys. The official integration is strongly recommended.

### Local Development (HTTPS for Real-time Vision)

See the earlier "Run over HTTPS" section. Use the custom certificates for local camera testing of Real-time Vision + Physical features. Supabase is now required (no bypass). Follow the Supabase setup section for a full local instance.

### Other Deployment Notes

- **Vercel** is the easiest because of the native Supabase integration + automatic HTTPS + preview deployments.
- Set `NEXT_PUBLIC_SITE_URL` correctly so Stripe redirects and other absolute URLs work.
- For physical/smart home features in production, make sure your `PHYSICAL_CONTROLLER_URL` is publicly reachable (or use a secure tunnel / ngrok for testing).
- After deploy (or before first deploy), run the full updated `supabase/schema.sql` in your Supabase project's SQL Editor. This is critical:
  - Creates the `tools` table.
  - Seeds all tools, including the new proprietary ultra ones and the `orchestra_tool` (the flagship).
  - Without this, you won't see the dynamic list of tools in the UI on Vercel (the composer pulls from Supabase `tools` table for Proprietary Ultra features).
  - The `syncToolsToSupabase()` call in the orchestrate route will keep new tools in sync going forward.

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

© 2026 Edward Marin. All rights reserved.

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

Special tools: `personal_life_reflection`, `suggest_life_os_action`, `bridge_digital_to_physical`, `send_email`.

**Email Writing & Sending (Ultra Premium / Life OS)**: Agent can compose context-aware emails (using memories, live vision, physical state, Life OS reflections, etc.) and send them via Resend. Supports rich HTML, CC/BCC, attachments from storage. Add `RESEND_API_KEY` (and optionally `RESEND_FROM_EMAIL`). Falls back to simulation if not configured. Use for summaries, follow-ups, notifications, etc. (configure verified sender in Resend dashboard for production).

Example behavior: Notices stress from camera + full calendar → suggests physical environment adjustment + a realistic plan that respects your energy and emotional state. Or: "Send a follow-up email to the team summarizing today's physical sensor readings and decisions."

All of the above (multiple AIs, real-time vision, physical/smart home, emotional awareness, Life OS with email) can be combined in a single autonomous run. The more premium features you opt into, the more capable and context-aware your personal AI becomes.

## Proprietary Ultra Features (native to Orchestrator)

These five proprietary capabilities + the flagship Orchestra Tool represent the core differentiated IP built into Orchestrator as native capabilities. They are available exclusively to the Proprietary Ultra tier ($99/mo) and under commercial leasing / outright sale licenses. They turn Orchestrator from a capable personal AI command center into a high-value strategic system for business, government, knowledge work, and opportunity management (with the Orchestra Tool as the killer app for funding).

They are fully implemented as first-class tools (`policy_translation_engine`, `constituent_emotion_layering`, `knowledge_heat_map`, `invisible_workflow_weaver`, `opportunity_decay_clock`) with LLM-powered analysis over memory + context, plus auto "magical" invocation in Personal Life OS mode (similar to shadow/regret/ethical/dream behaviors) and special visual cards in the live trace.

**The Orchestra Tool — Flagship of Proprietary Ultra (native core of Orchestrator)**
`orchestra_tool` is a native, first-class part of Orchestrator exclusively in the Proprietary Ultra tier (not available lower). The 5 proprietary engines are orchestrated by this built-in tool. It is a complete autonomous funding acquisition engine deeply integrated into the Orchestrator agent loop:
- Live multi-source opportunity discovery (grants, VC, angels, tenders...)
- Matches to your real biographical model + knowledge heat map
- Risk/probability scoring + decay clock timing analysis
- Auto-generates tailored applications and narratives (via policy translation + emotion layering for different funder "tribes")
- Produces warm intro drafts, full action plans, deadlines, and follow-up strategies

See FUNDING-FORGE.md (in your Downloads) for the original vision. It appears as a dedicated section in the main composer UI. Run it in Life OS Mode (or via the prefill button) on any real project for immediate high-value output. This is a core native capability of Orchestrator and the main reason for premium/enterprise pricing.

See the `proprietary-features.html` mockup (in Downloads) for the visual design language that was integrated into the in-app Tiers & Costs list.

**Policy Translation Engine**  
Translates complex policy into the exact language that resonates with different demographic "tribes" while maintaining factual integrity.

**Constituent Emotion Layering**  
Maps emotional undercurrents in constituent communications (anger, hope, fear, apathy) across regions and time without invading privacy.

**Knowledge Heat Map**  
Shows which parts of your company’s knowledge base are "cooling off" (becoming outdated) versus "heating up" (gaining relevance) in real time.

**Invisible Workflow Weaver**  
Automatically discovers undocumented workflows in a company by watching digital exhaust (file movements, email patterns, calendar overlaps) and turns them into shareable playbooks.

**Opportunity Decay Clock**  
Assigns a real-time "half-life" to every business opportunity, showing how fast it’s decaying and what action would extend its viability.

These features leverage the full stack (memory + vision + Life OS + email + storage + traces) and are positioned as the primary justification for the higher Ultra tier pricing and enterprise licensing models (leasing, subscription, outright sale).

