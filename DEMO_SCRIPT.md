# Orchestrator Demo Recording Script
## Goal: Create a 3-5 minute high-converting demo video for Gumroad

**Target length:** 3:30 – 4:30 minutes  
**Style:** Screen recording + voiceover (clean, confident, no fluff). Use Loom or OBS.  
**Thumbnail idea:** Screen showing live steps appearing in real time with the task "Research best noise-cancelling headphones under $200 released in 2025".

### Key Message to Hammer
"This is the AI agent platform where you can actually *watch* it work. Every thought, tool call, and result is streamed live and saved forever."

### Exact Shot List + Script (Read this while recording)

**0:00 – 0:20 | Hook + Problem**
- Open the app (dark theme, clean UI)
- Show the main input area
- Voiceover: 
  "Most AI agent tools are black boxes. You give it a goal and hope for the best. 
  With Orchestrator you get full visibility — every step the agent takes is streamed live and permanently logged."

**0:20 – 0:45 | One-Shot Vision (quick credibility)**
- Attach 1-2 images (use something relevant like product photos or a screenshot)
- Enter a simple task: "Analyze these images and tell me the key features and any issues"
- Submit (non-autonomous)
- Show the result
- Voiceover: "It handles vision natively with high detail. But the real power is when you let it run autonomously."

**0:45 – 1:10 | Switch to Autonomous + Live Magic**
- Check the "Run autonomously (Pro)" box
- Prefill a strong goal (use one of the sample buttons we'll add):
  "Research the best noise-cancelling headphones under $200 released in 2025. Compare top 3 models with current prices and real user feedback."
- Hit submit
- Immediately switch to showing the **Live Agent Execution** panel
- Voiceover: "Watch this. The agent starts thinking, recalls any relevant memory, then uses real tools."

**1:10 – 3:00 | The Live Run (the money shot)**
- Let it run for real (this is why you need Tavily + OpenAI keys set up).
- Narrate what’s happening as steps appear:
  - "First thought..."
  - "It decides to use web_search..."
  - "Tool call happens live..."
  - "Gets results and reasons about them..."
  - "Saves important facts to long-term memory..."
  - "Continues planning with add_todo internally..."
- Point out:
  - Steps appearing in real time (this is the NDJSON stream + realtime)
  - Different step types (thought, tool_call, tool_result, memory, final)
  - The run is being persisted to the database

**3:00 – 3:45 | Review Historical Trace**
- After it finishes (or while it's running), go to "Recent Autonomous Runs"
- Click "View trace" on the completed run
- Scroll through the full history
- Voiceover: "Everything is saved. You can come back days or weeks later and review the exact reasoning and tool calls. This is huge for trust, auditing, or turning good runs into reusable skills."

**3:45 – 4:15 | Memory in Action (bonus power move)**
- Start a *new* autonomous run with a related goal
- Show that it recalled previous memory at the beginning
- Voiceover: "Because it has persistent long-term memory, the agent actually gets smarter about you and your goals over time."

**4:15 – End | Close + CTA**
- Show the full tech stack quickly (Next.js, Supabase, Stripe, OpenAI, Tavily)
- "This is the complete, production-ready source code. You get the autonomous agent, the trace system, billing, auth — everything wired up."
- "License is commercial — build and sell your own products with it."
- End screen: Link to Gumroad + "Early bird $149"

### Recording Tips
- Run the app locally with real keys (Tavily is important for impressive tool use).
- Use a good sample goal that takes 8-15 steps (not too long).
- Record in 1080p or higher.
- Speak naturally and point at things on screen.
- If the agent gets stuck or does something dumb, just cut that part — you control the edit.
- Have 2-3 different sample goals ready in case one run is particularly good.

### Sample Goals (pre-fill these in the UI for easy demoing)
1. "Research the best noise-cancelling headphones under $200 released in 2025. Compare top 3 models with current prices and real user feedback."
2. "Plan a 4-day trip to Tokyo for a solo traveler in March. Include budget breakdown, must-see spots, and food recommendations."
3. "Find and summarize the latest research on using AI agents for personal productivity. Include tools and real-world case studies."

We'll add buttons for these in the app so you can click and go instantly.

### Post-Production
- Add subtle text overlays on key moments ("Live streaming", "Tool call", "Memory saved").
- Background music: subtle tech / focus track (low volume).
- Chapters in the video description for Gumroad.

Once you record this, drop the link here and I can help you embed it in the Gumroad copy or suggest edits.

Let's make this the demo that actually converts. Ready when you are — tell me if you want me to add the sample goal buttons to the UI right now.