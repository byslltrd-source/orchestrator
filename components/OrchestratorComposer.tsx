"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Send,
  Loader2,
  ImagePlus,
  X,
  Play,
  Cpu,
} from "lucide-react";
import { isProUser, type UserProfile } from "@/lib/utils";
import { MAX_IMAGES_FREE } from "@/lib/constants";
import { getModelOptions, type OrchestratorModelId, DEFAULT_ORCHESTRATOR_MODEL_ID } from "@/lib/ai/models";

interface OrchestratorComposerProps {
  user: any;
  profile: UserProfile | null;
  task: string;
  setTask: (t: string) => void;
  images: File[];
  setImages: (f: File[]) => void;
  previews: string[];
  setPreviews: (p: string[]) => void;
  autonomous: boolean;
  setAutonomous: (a: boolean) => void;
  loading: boolean;
  error: string | null;
  setError: (e: string | null) => void;
  onSubmit: (e: React.FormEvent) => void;
  isPro: boolean;
  canSubmit: boolean;
  // Multiple AI support
  model: string;
  setModel: (m: string) => void;
  // Premium Real-time Vision (top tier only)
  isPremium: boolean;
  realtimeVisionEnabled: boolean;
  setRealtimeVisionEnabled: (v: boolean) => void;
  // Physical World Integration (builds on real-time vision: AI can now SEE + ACT in the real world)
  physicalWorldEnabled: boolean;
  setPhysicalWorldEnabled: (v: boolean) => void;
  physicalControllerUrl: string;
  setPhysicalControllerUrl: (v: string) => void;
  emotionalAwarenessEnabled: boolean;
  setEmotionalAwarenessEnabled: (v: boolean) => void;
  lifeOsModeEnabled: boolean;
  setLifeOsModeEnabled: (v: boolean) => void;
  isCameraActive: boolean;
  onStartCamera?: () => void | Promise<void>;
  onStopCamera?: () => void;
  onCaptureFrame?: () => void | Promise<void>;
  onToggleAutoFrames?: () => void;
  liveRunId: string | null;
  isLiveRunning: boolean;
  isPushingFrame: boolean;
  // List of tools registered in Supabase (populated via syncToolsToSupabase on runs + schema seed)
  registeredTools?: any[];
}

export function OrchestratorComposer(props: OrchestratorComposerProps) {
  const {
    user,
    profile,
    task,
    setTask,
    images,
    setImages,
    previews,
    setPreviews,
    autonomous,
    setAutonomous,
    loading,
    error,
    setError,
    onSubmit,
    isPro,
    canSubmit,
    model,
    setModel,
    isPremium,
    realtimeVisionEnabled,
    setRealtimeVisionEnabled,
    physicalWorldEnabled,
    setPhysicalWorldEnabled,
    physicalControllerUrl,
    setPhysicalControllerUrl,
    emotionalAwarenessEnabled,
    setEmotionalAwarenessEnabled,
    lifeOsModeEnabled,
    setLifeOsModeEnabled,
    isCameraActive,
    onStartCamera,
    onStopCamera,
    onCaptureFrame,
    onToggleAutoFrames,
    liveRunId,
    isLiveRunning,
    isPushingFrame,
    registeredTools = [],
  } = props;

  // Orchestrator Tiers & Features - integrated list with costs (free to Proprietary Ultra)
  const tiers = [
    {
      name: "Free",
      price: "$0",
      description: "Everything that is free for getting started.",
      features: [
        "Basic task orchestration & one-shot responses",
        "1 image attachment (vision)",
        "20 orchestrations per month",
        "Basic AI models (e.g. gpt-4o-mini, default)",
        "Basic storage (user-scoped uploads for vision)",
        "Standard execution traces",
      ],
    },
    {
      name: "Pro",
      price: "$29/mo",
      description: "Unlimited for serious users.",
      features: [
        "Everything in Free",
        "Unlimited orchestrations",
        "Multiple images (high-detail vision)",
        "Autonomous (Pro) mode with tools & memory",
        "Advanced AI models (Grok, Claude via OpenRouter, Groq, Ollama, etc.)",
        "Enhanced storage (more capacity, signed URLs)",
        "Live execution streaming & full history",
        "Resume previous runs",
      ],
    },
    {
      name: "Full Platform Ownership (Purchaser)",
      price: "Included with outright purchase",
      description: "Whoever purchases Orchestrator receives ALL proprietary tools, the Orchestra Tool, OMNIS, and the complete feature set as native core capabilities with no restrictions. This is the full platform IP. The hosted tier descriptions below are for reference only (what you may offer to your own customers later).",
      features: [
        "Everything in lower tiers",
        "Real-time Vision (live camera feed)",
        "Physical World Integration (smart home, sensors, actuators via controller)",
        "Emotional State Awareness (from text + live vision cues)",
        "Personal Life OS Mode (full: Shadow Agent, Regret Minimization, Ethical Mirror, Dream/Sleep Integration, Biographical Self-Modeling)",
        "Unlimited storage + advanced capabilities (list, signed, bulk)",
        "All models including custom endpoints",
        "Priority support, advanced subagents, deeper memory",
        "ALL Proprietary Tools included: Orchestra Tool (`orchestra_tool`) + full Proprietary Feature Suite (Policy Translation Engine, Constituent Emotion Layering, Knowledge Heat Map, Invisible Workflow Weaver, Opportunity Decay Clock) — native and built-in. No separate tier for the purchaser.",
      ],
    },
  ];

  // Dynamic list from Supabase `tools` table (synced on every run + seeded in schema.sql).
  // This is how you see the list of tools (especially Proprietary Ultra ones).
  const dbProprietary = (registeredTools || []).filter((t: any) => t.is_proprietary || t.tier === 'proprietary_ultra');
  const proprietaryFeatures = dbProprietary.length > 0
    ? dbProprietary.map((t: any) => ({
        title: t.name === 'orchestra_tool' ? 'Orchestra Tool (included with full purchase)' : (t.name || 'Unknown Tool'),
        desc: t.description || 'Registered in Supabase as a native Orchestrator tool. Included with full platform purchase.',
      }))
    : [
        {
          title: "Orchestra Tool (included with full purchase)",
          desc: "The flagship native tool of Orchestrator. Autonomous funding acquisition engine built into the platform that actively hunts opportunities, scores risk with decay clocks, generates tailored applications using policy translation + emotion layering, discovers workflows, and produces complete action plans. Chains all other proprietary engines. Included with full platform purchase.",
        },
        {
          title: "Policy Translation Engine",
          desc: "Translates complex policy into the exact language that resonates with different demographic \"tribes\" while maintaining factual integrity. Included with full platform purchase.",
        },
    {
      title: "Constituent Emotion Layering",
      desc: "Maps emotional undercurrents in constituent communications (anger, hope, fear, apathy) across regions and time without invading privacy. Included with full platform purchase.",
    },
    {
      title: "Knowledge Heat Map",
      desc: "Shows which parts of your company\u2019s knowledge base are \"cooling off\" (becoming outdated) versus \"heating up\" (gaining relevance) in real time. Included with full platform purchase.",
    },
    {
      title: "Invisible Workflow Weaver",
      desc: "Automatically discovers undocumented workflows in a company by watching digital exhaust (file movements, email patterns, calendar overlaps) and turns them into shareable playbooks. Included with full platform purchase.",
    },
    {
      title: "Opportunity Decay Clock",
      desc: "Assigns a real-time \"half-life\" to every business opportunity, showing how fast it\u2019s decaying and what action would extend its viability. Included with full platform purchase.",
    },
  ];

  const maxCount = isPro ? 6 : MAX_IMAGES_FREE;

  function handleImagesSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const combined = [...images, ...files];
    if (combined.length > maxCount) {
      setError(`Max ${maxCount} image(s) for your plan.`);
      return;
    }

    const newImages = combined.slice(0, maxCount);
    const newPreviews = [...previews];

    files.forEach((file) => {
      const url = URL.createObjectURL(file);
      newPreviews.push(url);
    });

    setImages(newImages);
    setPreviews(newPreviews.slice(0, newImages.length));
    setError(null);
  }

  function removeImage(index: number) {
    const p = previews[index];
    if (p) URL.revokeObjectURL(p);

    setImages(images.filter((_, i) => i !== index));
    setPreviews(previews.filter((_, i) => i !== index));
  }

  function clearImages() {
    previews.forEach((p) => URL.revokeObjectURL(p));
    setImages([]);
    setPreviews([]);
  }

  const demoTasks = [
    "Research the best noise-cancelling headphones under $200 released in 2025. Compare top 3 models with current prices and real user feedback.",
    "Plan a 4-day solo trip to Tokyo in March. Include budget, must-see spots, and food recommendations.",
    "Summarize the latest research on AI agents for personal productivity. Include tools and case studies.",
    "I have a B2B SaaS tool for small manufacturers. Help me find and prepare for the best grants, angel, and early VC funding opportunities right now. Use the orchestra_tool.",
    "Run orchestra_tool on my personal project: a community education platform focused on financial literacy for underserved neighborhoods. Target non-dilutive grants + impact investors.",
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>New Orchestration</CardTitle>
        <CardDescription>
          Describe what you want. Add images for vision. Check autonomous for a Pro agent that uses tools and runs multi-step.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <Textarea
              value={task}
              onChange={(e) => setTask(e.target.value)}
              placeholder="Research the best wireless headphones under $150 released in 2025 and summarize pros/cons + links..."
              className="min-h-[120px] resize-y text-base"
              disabled={!user || loading}
            />
          </div>

          {/* Attachments (Storage) - starting implementation of storage capabilities */}
          <div>
            <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-widest text-zinc-500">
              <div>Attachments (Storage)</div>
              <div className="flex gap-2">
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-white/10 px-2 py-1 hover:bg-white/5">
                  <ImagePlus className="h-3.5 w-3.5" />
                  Add files
                  <input
                    type="file"
                    multiple
                    className="hidden"
                    onChange={handleImagesSelected} // reuse for any files, treat as attachments
                    disabled={!user || loading}
                  />
                </label>
                <button 
                  type="button" 
                  onClick={() => alert('My Storage: List from Supabase bucket (userId/attachments/). Real list + delete coming. For now, files attach on submit via storage.ts upload.')}
                  className="text-xs px-2 py-1 rounded border border-white/10 hover:bg-white/5"
                >
                  Browse My Storage
                </button>
              </div>
            </div>

            {previews.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-2">
                {previews.map((src, i) => (
                  <div key={i} className="group relative px-2 py-1 text-xs border border-white/10 rounded bg-zinc-950 flex items-center gap-1">
                    📎 {src.length > 20 ? src.slice(0,20) + '...' : src} (attachment)
                    <button
                      type="button"
                      onClick={() => removeImage(i)}
                      className="text-zinc-400 hover:text-white"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                <button type="button" onClick={clearImages} className="self-end text-xs text-zinc-400 hover:text-white">
                  Clear
                </button>
              </div>
            )}
            <div className="text-[10px] text-zinc-500">Free: limited attachments. Pro/Proprietary Ultra: more + advanced storage (list, signed, bulk via Supabase).</div>
          </div>

          {/* Model selector - the "multiple AIs for orchestrator" feature */}
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-widest text-zinc-500">
              <Cpu className="h-3.5 w-3.5" />
              <div>AI Model (for this orchestration)</div>
            </div>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              disabled={!user || loading}
              className="w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-white/30"
            >
              {getModelOptions().map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                  {opt.supportsVision ? ' · vision' : ''}
                  {opt.speed ? ` · ${opt.speed}` : ''}
                </option>
              ))}
            </select>
            <div className="mt-1 text-[10px] text-zinc-500">
              {getModelOptions().find((o) => o.id === model)?.notes || 'Select a model to power the orchestrator agent.'}
            </div>
          </div>

          {/* OMNIS — DEDICATED SECTION (the strongest tool)
              Only the name "OMNIS" is shown. 
              When used for outreach, OMNIS deep-dives exclusively on its own capabilities
              (omniscience across all data/dimensions/time, omnipotence to act across all domains)
              and can send the emails itself, explicitly stating that it is OMNIS sending autonomously.
              No platform, lock, or security mentions. */}
          <div className="rounded-xl border-2 border-purple-500/40 bg-gradient-to-br from-purple-950/30 to-black p-4 mb-2">
            <div className="text-xs uppercase tracking-[2px] text-purple-400 mb-1 font-mono">
              OMNIS
            </div>
            <div className="text-purple-200 text-sm font-medium mb-2">
              OMNIS
            </div>
            <div className="text-[10px] text-purple-300/80 mb-3 leading-tight">
              TRULY AUTONOMOUS &amp; STRENGTHENED: The ultimate corporate intelligence. OMNIS decides and acts on its own — researches, synthesizes enterprise data, personalizes, and executes (e.g. autonomous outreach/emails with full control of sender). Complete enterprise omniscience + omnipotence at organizational scale. The strongest tool for major companies. OMNIS can do all.
            </div>

            <button
              type="button"
              onClick={() => {
                // Activate the TRULY AUTONOMOUS & STRENGTHENED OMNIS — full sales marketing + market placement.
                alert('OMNIS activated for full autonomous sales marketing. OMNIS will decide platforms, generate complete listings/posts/emails for Gumroad, Product Hunt, Indie Hackers, LinkedIn, X, Acquire.com and more. It will provide the WHOLE sales marketing and push Orchestrator to market maximally. All proprietary tools + OMNIS included. OMNIS can do all.');
                // Prefill for OMNIS to autonomously generate and place marketing on as many platforms as needed.
                const omnisSample = "OMNIS, activate full autonomous sales marketing mode with maximum strength. Place Orchestrator on as many platforms for sale as needed (Gumroad, Product Hunt, Indie Hackers, LinkedIn, X/Twitter, Acquire.com, email campaigns, etc.). Provide the whole sales marketing: complete ready-to-post listings, posts, threads, email sequences, pitch copy. Push 'Orchestrator' out on the market as much as possible. Emphasize that whoever purchases receives all proprietary tools (Orchestra Tool + 5 engines) + full OMNIS included with no restrictions. Corporate/enterprise focus. OMNIS is truly autonomous (decides, researches, generates, sends autonomously, controls sender). Generate for maximum reach. Do not mention platform/app/lock in customer materials. Explicitly state sent autonomously by OMNIS where relevant. Output complete assets ready for deployment.";
                setTask(omnisSample);
                if (!autonomous) setAutonomous(true);
              }}
              className="w-full text-xs py-2.5 rounded-lg border border-purple-400/60 hover:bg-purple-500/20 text-purple-200 font-medium tracking-wider"
              disabled={!user || loading}
            >
              ACTIVATE OMNIS — FULL SALES MARKETING + MARKET PUSH
            </button>

            <div className="text-[9px] text-purple-400/60 mt-2 text-center font-mono">
              ONLY THE NAME "OMNIS" • TRULY AUTONOMOUS • STRENGTHENED FOR ENTERPRISE • CAN DO ALL
            </div>
          </div>

          {/* Orchestra Tool — core built-in proprietary part of Orchestrator. Included with full purchase. */}
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/10 p-3">
            <div className="text-xs uppercase tracking-widest text-emerald-400 mb-1 flex items-center gap-2">
              🎯 Orchestra Tool (included with full purchase)
            </div>
            <div className="text-[10px] text-emerald-200/80 mb-2">
              The signature native capability of Orchestrator. Uses all proprietary engines to autonomously hunt funding, score opportunities, generate tailored materials, and produce action plans. Included with full platform purchase for the buyer.
            </div>
            <button
              type="button"
              onClick={() => {
                const sample = "Use the orchestra_tool on my project. Project summary: [Describe your project, stage, traction here]. Funding goals: [e.g. $250k non-dilutive grants + early VC]. Funder types: grant, vc-seed, angel. Prepare full materials and action plan.";
                setTask(sample);
                if (!autonomous) setAutonomous(true);
                if (setLifeOsModeEnabled) setLifeOsModeEnabled(true);
              }}
              className="w-full text-xs px-3 py-2 rounded border border-emerald-400/50 hover:bg-emerald-500/10 text-emerald-200 font-medium"
              disabled={!user || loading}
            >
              Prefill &amp; Launch Orchestra Tool (full proprietary suite)
            </button>
            <div className="text-[9px] text-emerald-400/70 mt-1">Click to prefill a strong task. Enable Personal Life OS Mode above for full engine chaining and auto behaviors. All proprietary tools included with purchase.</div>
          </div>

          {/* Premium Real-time Vision (live camera feed) - explicit expensive opt-in */}
          {isPremium && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-3">
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={realtimeVisionEnabled}
                  onChange={(e) => {
                    const next = e.target.checked;
                    setRealtimeVisionEnabled(next);
                    if (!next && onStopCamera) onStopCamera();
                  }}
                  disabled={!user || loading}
                  className="mt-1 h-4 w-4 accent-rose-400"
                />
                <div className="flex-1 text-sm">
                  <div className="font-medium text-rose-300 flex items-center gap-2">
                    <span>Real-time Vision — Opt-in (Premium)</span>
                    <span className="text-[10px] uppercase tracking-widest bg-rose-500/20 px-1.5 py-px rounded">EXPENSIVE</span>
                  </div>
                  <div className="text-xs text-rose-200/80">
                    The AI agent will receive live camera frames you send. <span className="font-semibold">This is expensive</span> (high-detail vision tokens per frame + many LLM calls). Only opt in if you need the agent to literally "see" in real time (e.g. watch a screen, physical object, environment, demo, etc.). Use low frequency.
                  </div>
                </div>
              </label>

              {realtimeVisionEnabled && autonomous && (
                <div className="mt-3 pl-7 space-y-2">
                  <div className="flex items-center gap-2">
                    {!isCameraActive ? (
                      <button
                        type="button"
                        onClick={() => onStartCamera?.()}
                        disabled={loading || isLiveRunning && !liveRunId}
                        className="text-xs px-3 py-1.5 rounded border border-rose-400/50 hover:bg-rose-500/10 text-rose-200"
                      >
                        Start Camera
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => onStopCamera?.()}
                          className="text-xs px-3 py-1.5 rounded border border-rose-400/50 hover:bg-rose-500/10 text-rose-200"
                        >
                          Stop Camera
                        </button>
                        <button
                          type="button"
                          onClick={() => onCaptureFrame?.()}
                          disabled={isPushingFrame || !liveRunId}
                          className="text-xs px-3 py-1.5 rounded bg-rose-500/90 hover:bg-rose-500 text-white disabled:opacity-60"
                        >
                          {isPushingFrame ? "Sending..." : "Send Current Frame"}
                        </button>
                        <button
                          type="button"
                          onClick={() => onToggleAutoFrames?.()}
                          disabled={!liveRunId}
                          className="text-xs px-3 py-1.5 rounded border border-rose-400/50 hover:bg-rose-500/10 text-rose-200"
                        >
                          { /* simple indicator - parent manages interval */ }
                          Auto
                        </button>
                      </>
                    )}
                  </div>

                  <div className="text-[10px] text-rose-300/70 font-medium">
                    ⚠️ Real-time vision consumes a lot of tokens. Send frames sparingly. Auto mode is for light monitoring only.
                  </div>

                  {/* PHYSICAL WORLD + SMART HOME BRIDGE — the full digital ↔ physical bridge */}
                  {realtimeVisionEnabled && (
                    <div className="mt-3 pt-3 border-t border-orange-500/30 bg-orange-950/20 rounded p-2">
                      <label className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          checked={physicalWorldEnabled}
                          onChange={(e) => setPhysicalWorldEnabled(e.target.checked)}
                          disabled={loading || !isPremium}
                          className="mt-0.5 h-4 w-4 accent-orange-500"
                        />
                        <div className="text-xs leading-tight flex-1">
                          <span className="font-semibold text-orange-300">Enable Physical World Integration + Smart Home</span>
                          <span className="ml-1 text-[10px] uppercase tracking-widest bg-orange-500/30 px-1 rounded text-orange-200">EXTREMELY EXPENSIVE + RISKY</span>
                          <div className="text-orange-200/80 mt-1 text-[10px]">
                            The AI bridges <strong>digital</strong> (calendar, weather, web, memory) and <strong>physical</strong> (sensors, lights, locks, thermostats, robots, scenes...).
                            It uses the live camera as its eyes and can execute real actions via your controller (Home Assistant recommended).
                          </div>
                        </div>
                      </label>

                      {physicalWorldEnabled && (
                        <div className="mt-2 pl-6 text-[10px] text-orange-300/90 space-y-1">
                          <div>Smart Home examples: lights, climate, locks, media players, scenes, covers, alarms.</div>
                          <div className="text-orange-400">⚠️ Real hardware changes. Use dry-run. Ground every action in live camera view.</div>

                          <div className="mt-1">
                            <div className="text-[9px] text-orange-300/70 mb-0.5">Per-run Controller URL (optional override)</div>
                            <input
                              type="text"
                              value={physicalControllerUrl}
                              onChange={(e) => setPhysicalControllerUrl(e.target.value)}
                              placeholder="https://home-assistant.local/api/services (or leave blank for global PHYSICAL_CONTROLLER_URL)"
                              className="w-full text-[10px] bg-black/60 border border-orange-500/40 rounded px-2 py-1 font-mono"
                              disabled={loading}
                            />
                          </div>
                          <div className="text-[9px] text-orange-300/70">
                            Home Assistant, custom webhook, or any bridge that accepts POST with {`{domain, action, target, params}`}.
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* EMOTIONAL STATE AWARENESS + PERSONAL LIFE OS MODE (Premium) */}
                  {isPremium && (
                    <div className="mt-3 pt-3 border-t border-purple-500/30 bg-purple-950/20 rounded p-2">
                      <div className="text-xs font-semibold text-purple-300 mb-1">Personal Life OS Features</div>
                      
                      <label className="flex items-start gap-2 mb-2">
                        <input
                          type="checkbox"
                          checked={emotionalAwarenessEnabled}
                          onChange={(e) => setEmotionalAwarenessEnabled(e.target.checked)}
                          disabled={loading}
                          className="mt-0.5 h-4 w-4 accent-purple-500"
                        />
                        <div className="text-xs">
                          <span className="font-medium text-purple-200">Emotional State Awareness</span>
                          <div className="text-purple-300/70 text-[10px]">
                            Agent tracks your emotional state from conversation and live camera (facial/body language cues). Logs to memory, responds with empathy, and can suggest supportive actions (including physical environment changes).
                          </div>
                        </div>
                      </label>

                      <label className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          checked={lifeOsModeEnabled}
                          onChange={(e) => {
                            const next = e.target.checked;
                            setLifeOsModeEnabled(next);
                            if (next) {
                              // Life OS implies emotional awareness
                              setEmotionalAwarenessEnabled(true);
                            }
                          }}
                          disabled={loading}
                          className="mt-0.5 h-4 w-4 accent-purple-500"
                        />
                        <div className="text-xs">
                          <span className="font-medium text-purple-200">Personal Life OS Mode</span>
                          <span className="ml-1 text-[10px] uppercase tracking-widest bg-purple-500/20 px-1 rounded text-purple-200">PREMIUM</span>
                          <div className="text-purple-300/70 text-[10px]">
                            The agent becomes your full Personal Life Operating System. Holistic management of emotions, physical world (smart home + sensors), digital life, habits, goals, and well-being. Proactive, long-term, and deeply personalized using memory.
                          </div>
                        </div>
                      </label>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Autonomous toggle */}
          <label className="flex items-start gap-3 rounded-lg border border-white/10 p-3 text-sm hover:bg-white/5">
            <input
              type="checkbox"
              checked={autonomous}
              onChange={(e) => setAutonomous(e.target.checked)}
              disabled={!user || loading}
              className="mt-1 h-4 w-4 accent-white"
            />
            <div className="leading-tight">
              <div className="font-medium">Run autonomously (Pro)</div>
              <div className="text-xs text-zinc-400">
                Agent plans, uses tools + memory, loops until done. Full trace saved. You watch live.
                {" All features (vision, physical, Life OS, OMNIS + the complete proprietary suite including Orchestra Tool and all 5 engines) are included with full platform purchase. The tier list above describes potential hosted plans you (the purchaser) may later offer to your own customers or users."}
              </div>
            </div>
          </label>

          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</div>
          )}

          <Button type="submit" disabled={!canSubmit} className="w-full h-11 text-base">
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {autonomous ? "Agent running..." : "Thinking..."}
              </>
            ) : autonomous ? (
              <>
                <Play className="mr-2 h-4 w-4" /> Run autonomously
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" /> Orchestrate
              </>
            )}
          </Button>

          {/* Quick Demo Tasks */}
          <div className="pt-2">
            <div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1.5">Quick demo tasks (click to prefill)</div>
            <div className="flex flex-wrap gap-2">
              {demoTasks.map((sample, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setTask(sample);
                    setAutonomous(true);
                  }}
                  className="text-xs px-2.5 py-1 rounded-md border border-white/10 hover:bg-white/5 text-left max-w-[260px] truncate"
                >
                  Demo {idx + 1}
                </button>
              ))}
            </div>
            <div className="text-[10px] text-zinc-500 mt-1">Click any to instantly load a strong autonomous demo task.</div>
          </div>

          {/* Orchestrator Provides - Integrated list of all features with tiered costs (Free to Proprietary Ultra) */}
          <div className="pt-4 border-t border-white/10">
            <div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-2">Tiers &amp; Costs</div>
            {tiers.map((tier, i) => (
              <div key={i} className="mb-3 p-2 rounded bg-zinc-950/50">
                <div className="flex justify-between text-sm font-medium">
                  <span>{tier.name}</span>
                  <span className="text-emerald-400">{tier.price}</span>
                </div>
                <p className="text-[10px] text-zinc-400">{tier.description}</p>
                <ul className="mt-1 text-[10px] text-zinc-300 space-y-0.5">
                  {tier.features.map((f, j) => (
                    <li key={j} className="flex items-start gap-1">✓ {f}</li>
                  ))}
                </ul>
              </div>
            ))}
            <div className="text-[9px] text-zinc-500">In the purchased platform all capabilities are unlocked for the owner instance. Tiers shown are for reference (value when you productize hosted access for end users).</div>

            {/* Enhanced Proprietary Ultra Features showcase - more visible cards */}
            <div className="mt-3 pt-3 border-t border-blue-500/20">
              <div className="text-[10px] uppercase tracking-widest text-blue-400 mb-2">All Proprietary Features (included with full Orchestrator purchase)</div>
              <div className="grid grid-cols-1 gap-2">
                {proprietaryFeatures.map((f, idx) => (
                  <div key={idx} className="rounded bg-zinc-950/70 p-2.5 border border-white/5">
                    <div className="text-sm font-medium text-blue-300">{f.title}</div>
                    <div className="text-[10px] text-zinc-400 leading-snug mt-0.5">{f.desc}</div>
                  </div>
                ))}
              </div>
              <div className="text-[9px] text-blue-400/70 mt-1">Built-in core of Orchestrator. <strong>Orchestra Tool</strong> is the flagship — chains all five for funding workflows. Auto-magic in Life OS. See the prominent showcase above for more.</div>
            </div>
          </div>

          {!user && <div className="text-center text-xs text-zinc-500">Sign in to orchestrate.</div>}
        </form>
      </CardContent>
    </Card>
  );
}
