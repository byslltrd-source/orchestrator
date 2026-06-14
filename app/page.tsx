"use client";

// Copyright (c) 2026 Edward Marin. All rights reserved.
// This source code is proprietary. See LICENSE and the Commercial License Agreement for usage rights.

import { useState, useEffect, useRef, useCallback } from "react";

// Fully client-side authenticated experience — force dynamic to avoid build-time prerender
// that would execute the Supabase browser client without env vars present.
export const dynamic = "force-dynamic";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";
import type { AgentStep, StepRow, LiveEvent, RecentRun } from "@/lib/agent/types";
import { type UserProfile } from "@/lib/utils";
import { MAX_IMAGE_UPLOAD_BYTES, MAX_IMAGES_FREE, OWNER_USER_ID } from "@/lib/constants";
import { OrchestratorComposer } from "@/components/OrchestratorComposer";
import { LiveExecution } from "@/components/LiveExecution";
import { TraceViewer } from "@/components/TraceViewer";
import { RecentRunsList } from "@/components/RecentRunsList";
import { UsageHistory } from "@/components/UsageHistory";
import { useRuns } from "@/lib/hooks/useRuns";
import {
  Send,
  Loader2,
  ImagePlus,
  X,
  Play,
  History,
  Eye,
  Brain,
  CheckCircle2,
} from "lucide-react";

type Profile = UserProfile;

export default function OrchestratorPage() {
  const supabase = createClient();

  // SINGLE-OWNER MODE (no public sign up / login)
  // The entire artifact runs under one fixed owner identity.
  // Purchaser of the platform integrates their own auth / multi-user system as they see fit.
  const user: User = {
    id: OWNER_USER_ID,
    email: 'owner@orchestrator.internal',
    app_metadata: {},
    user_metadata: {},
    aud: 'authenticated',
    created_at: new Date().toISOString(),
  } as any;

  const ownerProfile: UserProfile = {
    subscription_plan: 'ultra',
    subscription_status: 'active',
    orchestrations_used: 0,
    orchestrations_limit: 999999,
  } as UserProfile & { id?: string; tier?: string };

  // Always full access in owner/purchaser deployment mode
  const profile = ownerProfile;
  // No useProfile hook needed for the owner artifact (kept for reference if buyer re-adds multi-user auth)

  // Composer state (kept here for form control, passed to component)
  const [task, setTask] = useState("");
  const [images, setImages] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [autonomous, setAutonomous] = useState(false);
  // Multiple AIs: which orchestrator model to use for this run
  const [model, setModel] = useState<string>("default");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Premium Real-time Vision (live camera)
  // isPremium overridden below for test mode support
  const [realtimeVisionEnabled, setRealtimeVisionEnabled] = useState(false);
  const [physicalWorldEnabled, setPhysicalWorldEnabled] = useState(false); // Requires realtimeVisionEnabled + premium. High risk/expensive.
  const [physicalControllerUrl, setPhysicalControllerUrl] = useState(''); // per-run override for smart home / physical controller
  const [emotionalAwarenessEnabled, setEmotionalAwarenessEnabled] = useState(false);
  const [lifeOsModeEnabled, setLifeOsModeEnabled] = useState(false); // Personal Life OS Mode — holistic emotional + physical + digital life management
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isPushingFrame, setIsPushingFrame] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const autoFrameIntervalRef = useRef<any>(null);

  // One-shot result
  const [oneShotResult, setOneShotResult] = useState<string | null>(null);

  // Live autonomous (from current submit stream)
  const [liveRunId, setLiveRunId] = useState<string | null>(null);
  const [liveSteps, setLiveSteps] = useState<(AgentStep & { step_number?: number })[]>([]);
  const [isLiveRunning, setIsLiveRunning] = useState(false);
  const [liveFinal, setLiveFinal] = useState<string | null>(null);

  // List of tools from Supabase (so user can see every registered tool, including proprietary ultra ones)
  const [registeredTools, setRegisteredTools] = useState<any[]>([]);

  // Runs and trace via best-practice hook
  const {
    recentRuns,
    loadingRuns,
    loadRecentRuns: loadRecentRunsWithId,
    selectedRun,
    traceSteps,
    loadingTrace,
    loadTrace,
    isTraceLive,
    setIsTraceLive,
    setTraceSteps,
    setSelectedRun,
    setRecentRuns,
  } = useRuns();

  const loadRecentRuns = useCallback(() => {
    loadRecentRunsWithId(OWNER_USER_ID);
  }, [loadRecentRunsWithId]);

  // Usage history (full next layer)
  const [usageEvents, setUsageEvents] = useState<any[]>([]);

  const loadUsageEvents = useCallback(async () => {
    try {
      const { data } = await supabase
        .from("usage_events")
        .select("id, type, task, result_preview, images_count, created_at")
        .eq("user_id", OWNER_USER_ID)
        .order("created_at", { ascending: false })
        .limit(5);
      if (data) setUsageEvents(data);
    } catch {}
  }, [supabase]);

  // Realtime channel refs for cleanup
  const liveChannelRef = useRef<any>(null);
  const traceChannelRef = useRef<any>(null);

  // In single-owner / purchaser mode we are always "ultra" with everything unlocked.
  // No auth wall, no sign-up, no login. The buyer of the platform adds auth later as needed.
  const isPro = true;
  const isPremium = true;

  // Owner mode: load data under the fixed OWNER_USER_ID (writes in APIs also target this id via service client)
  useEffect(() => {
    loadRecentRunsWithId(OWNER_USER_ID);
    loadUsageEvents();
    // registeredTools effect below also depends on owner context
  }, []);

  // Cleanup camera on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  // Load registered tools from Supabase (always visible in owner/purchaser single-tenant mode)
  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase
          .from('tools')
          .select('name, description, tier, is_proprietary')
          .order('tier', { ascending: false })
          .order('name');
        if (data) setRegisteredTools(data);
      } catch (e) {
        // non-fatal; static list still shown in composer
      }
    })();
  }, [supabase]);

  // Owner / purchaser mode: all features (including expensive realtime vision + physical) are available.
  // No per-user consent tracking in the base single-tenant artifact. Buyer can extend.
  useEffect(() => {
    // no-op – full access always granted for the platform owner context
  }, [realtimeVisionEnabled]);

  // If realtime vision is disabled, physical world must also be disabled (it depends on live camera)
  useEffect(() => {
    if (!realtimeVisionEnabled && physicalWorldEnabled) {
      setPhysicalWorldEnabled(false);
    }
  }, [realtimeVisionEnabled, physicalWorldEnabled]);

  // Agent-driven real-time vision: if the agent calls the "capture_live_view" tool
  // and the customer has camera active + realtime opted in, automatically provide a frame.
  // This lets the AI "ask to see" in real time.
  useEffect(() => {
    if (!realtimeVisionEnabled || !isCameraActive || !liveRunId) return;

    const latest = liveSteps[liveSteps.length - 1];
    if (
      latest &&
      latest.type === 'tool_call' &&
      (latest as any).toolName === 'capture_live_view'
    ) {
      // Auto-fulfill the agent's request
      captureAndPushFrame();
    }
  }, [liveSteps, realtimeVisionEnabled, isCameraActive, liveRunId]);

  // Image handling moved to OrchestratorComposer (next layer refactor)

  // Main submit (one-shot or autonomous streaming)
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!task.trim()) {
      setError("Enter a task.");
      return;
    }
    // In owner/purchaser mode everything (including autonomous + all premium features) is unlocked.

    setError(null);
    setOneShotResult(null);
    setLiveFinal(null);
    setLiveSteps([]);
    setLiveRunId(null);
    setIsLiveRunning(autonomous);
    setLoading(true);

    // clear any prior live sub
    if (liveChannelRef.current) {
      supabase.removeChannel(liveChannelRef.current);
      liveChannelRef.current = null;
    }

    const formData = new FormData();
    formData.append("task", task.trim());
    if (autonomous) formData.append("autonomous", "true");
    formData.append("model", model);
    if (realtimeVisionEnabled && autonomous) formData.append("realtime_vision", "true");
    if (physicalWorldEnabled && realtimeVisionEnabled && autonomous) formData.append("physical_world", "true");
    if (physicalControllerUrl && physicalWorldEnabled) formData.append("physical_controller_url", physicalControllerUrl);
    if (emotionalAwarenessEnabled && autonomous) formData.append("emotional_awareness", "true");
    if (lifeOsModeEnabled && autonomous) formData.append("life_os_mode", "true");
    images.forEach((file) => formData.append("images", file));

    try {
      const res = await fetch("/api/orchestrate", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        let msg = `Request failed (${res.status})`;
        try {
          const j = await res.json();
          msg = j.error || msg;
        } catch {}
        throw new Error(msg);
      }

      const ct = res.headers.get("content-type") || "";

      if (autonomous && ct.includes("ndjson")) {
        // === LIVE STREAMING PATH ===
        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const evt = JSON.parse(line) as LiveEvent;

              if (evt.type === "run_started") {
                setLiveRunId(evt.run_id);
                // Start realtime too (so if you leave tab it still fills, or another client watches)
                attachLiveRealtime(evt.run_id);
              } else if (evt.type === "step") {
                setLiveSteps((prev) => [...prev, { ...evt.step, step_number: evt.step_number }]);
              } else if (evt.type === "done") {
                setLiveFinal(evt.final_result);
                setIsLiveRunning(false);
                // refresh history so the new completed run appears
                if (user?.id) loadRecentRunsWithId(user.id);
                // optionally auto-open the trace for it
                // (we keep the liveSteps visible; user can also click in Recent)
              } else if (evt.type === "error") {
                setError(evt.error);
                setIsLiveRunning(false);
              }
            } catch {
              // ignore bad line
            }
          }
        }

        setIsLiveRunning(false);
      } else {
        // === ONE-SHOT JSON PATH ===
        const data = await res.json();
        if (data.result) {
          setOneShotResult(data.result);
        }
        if (data.error) {
          setError(data.error);
        }
      }
    } catch (err: any) {
      setError(err?.message || "Something went wrong while orchestrating.");
      setIsLiveRunning(false);
    } finally {
      setLoading(false);
    }
  }

  // =====================
  // Premium Real-time Vision helpers (live camera for top-tier)
  // =====================
  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 640 }, height: { ideal: 480 } },
      });
      cameraStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setIsCameraActive(true);
      setError(null);
    } catch (e: any) {
      setError("Could not access camera. Please grant permission and try again.");
    }
  }

  function stopCamera() {
    if (autoFrameIntervalRef.current) {
      clearInterval(autoFrameIntervalRef.current);
      autoFrameIntervalRef.current = null;
    }
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((t) => t.stop());
      cameraStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
  }

  async function captureAndPushFrame() {
    if (!liveRunId || !videoRef.current || !isPremium) return;

    setIsPushingFrame(true);
    try {
      const video = videoRef.current;
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) throw new Error("Canvas error");

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const blob: Blob = await new Promise((resolve) =>
        canvas.toBlob((b) => resolve(b || new Blob()), "image/jpeg", 0.82)
      );
      const file = new File([blob], `rt-vision-${Date.now()}.jpg`, { type: "image/jpeg" });

      const fd = new FormData();
      fd.append("runId", liveRunId);
      fd.append("frame", file);

      const res = await fetch("/api/vision/push-frame", { method: "POST", body: fd });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Failed to send live frame");
      }
      const data = await res.json();

      // Optimistic + immediate feedback in the live trace
      if (data?.url) {
        setLiveSteps((prev) => [
          ...prev,
          { type: "vision_frame", content: data.url, step_number: prev.length + 1 },
        ]);
      }
    } catch (e: any) {
      setError(e?.message || "Live vision frame failed");
    } finally {
      setIsPushingFrame(false);
    }
  }

  function toggleAutoFrames() {
    if (!liveRunId || !isCameraActive) return;

    if (autoFrameIntervalRef.current) {
      clearInterval(autoFrameIntervalRef.current);
      autoFrameIntervalRef.current = null;
      return;
    }

    // Auto capture roughly every 5.5s (server enforces min interval)
    autoFrameIntervalRef.current = setInterval(() => {
      captureAndPushFrame();
    }, 5500);
  }

  // Realtime attach functions (kept for live streaming resilience - best practice)
  function attachLiveRealtime(runId: string) {
    if (liveChannelRef.current) {
      supabase.removeChannel(liveChannelRef.current);
    }
    const ch = supabase
      .channel(`live-run-${runId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "agent_steps", filter: `run_id=eq.${runId}` },
        (payload: { new: Record<string, unknown> }) => {
          const s = payload.new;
          const mapped: AgentStep & { step_number?: number } = {
            type: (s.type as AgentStep['type']) || 'thought',
            content: typeof s.content === 'string' ? s.content : undefined,
            toolName: typeof s.tool_name === 'string' ? s.tool_name : undefined,
            toolArgs: s.tool_args,
            toolResult: typeof s.tool_result === 'string' ? s.tool_result : undefined,
            step_number: typeof s.step_number === 'number' ? s.step_number : undefined,
          };
          setLiveSteps((prev) => {
            if (prev.some((p) => p.step_number === mapped.step_number)) return prev;
            return [...prev, mapped];
          });
        }
      )
      .subscribe();
    liveChannelRef.current = ch;
  }

  function clearLive() {
    setLiveSteps([]);
    setLiveRunId(null);
    setLiveFinal(null);
    setIsLiveRunning(false);
    if (liveChannelRef.current) {
      supabase.removeChannel(liveChannelRef.current);
      liveChannelRef.current = null;
    }
    // Premium realtime camera cleanup
    stopCamera();
    setRealtimeVisionEnabled(false);
    setPhysicalWorldEnabled(false);
    setEmotionalAwarenessEnabled(false);
    setLifeOsModeEnabled(false);
  }

  function attachTraceRealtime(runId: string) {
    if (traceChannelRef.current) {
      supabase.removeChannel(traceChannelRef.current);
    }
    setIsTraceLive(true);

    const ch = supabase
      .channel(`trace-steps-${runId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "agent_steps",
          filter: `run_id=eq.${runId}`,
        },
        (payload: { new: StepRow }) => {
          const newStep = payload.new;
          setTraceSteps((prev) => {
            if (prev.some((s) => s.step_number === newStep.step_number)) return prev;
            return [...prev, newStep].sort((a, b) => (a.step_number || 0) - (b.step_number || 0));
          });
        }
      )
      .subscribe();

    traceChannelRef.current = ch;
  }

  function cleanupChannels() {
    if (liveChannelRef.current) {
      supabase.removeChannel(liveChannelRef.current);
      liveChannelRef.current = null;
    }
    if (traceChannelRef.current) {
      supabase.removeChannel(traceChannelRef.current);
      traceChannelRef.current = null;
    }
  }

  function clearTrace() {
    setSelectedRun(null);
    setTraceSteps([]);
    setIsTraceLive(false);
    if (traceChannelRef.current) {
      supabase.removeChannel(traceChannelRef.current);
      traceChannelRef.current = null;
    }
  }

  // Note: Auth listener above handles user changes and initial load.
  // The previous user-id effect was removed to avoid duplication after restoring the full auth setup.

  // Cleanup channels on unmount
  useEffect(() => {
    return () => {
      cleanupChannels();
      previews.forEach((p) => URL.revokeObjectURL(p));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Safety: always ensure basic UI renders even if auth is slow
  // (prevents "completely blank" feeling while waiting for Supabase)

  const canSubmit = task.trim().length > 0 && !loading;

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <Header />

      <div className="mx-auto max-w-5xl px-6 py-8">
        {/* Hero / title */}
        <div className="mb-8 flex items-end justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10">
                <Brain className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-4xl font-semibold tracking-tighter">Orchestrator</h1>
                <p className="text-sm text-zinc-400">Your personal AI command center — one-shot or fully autonomous with tools + memory.</p>
              </div>
            </div>
          </div>
          {user && (
            <div className="hidden text-right text-xs text-zinc-500 sm:block">
              {isPro ? "Pro" : "Free"} · {profile ? `${profile.orchestrations_used} / ${profile.orchestrations_limit}` : ""}
            </div>
          )}
        </div>

        {/* Modern Tools Showcase - visible to everyone to understand what we offer and drive sign-ups */}
        <div className="mb-10">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-2xl font-semibold tracking-tight">Proprietary Ultra Tools</h2>
                  <p className="text-sm text-zinc-400">Native to Orchestrator. Exclusive to the top tier. These are what make us different.</p>
                </div>
                <div className="text-xs px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">Proprietary Ultra only</div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* Special OMNIS entry - the strongest tool, focused on its capabilities. */}
                <div className="rounded-xl border-2 border-purple-500/40 bg-gradient-to-br from-purple-950/20 to-zinc-950 p-4">
                  <div className="font-mono text-xl tracking-[3px] text-purple-300 mb-1">OMNIS</div>
                  <div className="text-[10px] text-purple-400/70">The strongest corporate intelligence. Enterprise omniscience over organizational data and strategy. Omnipotence for scaled business execution. Sent autonomously by OMNIS.</div>
                </div>

                {(registeredTools.length > 0 ? registeredTools.filter((t: any) => t.is_proprietary || t.tier === 'proprietary_ultra') : [
                  {name: 'orchestra_tool', description: 'The flagship autonomous funding acquisition engine. Hunts opportunities, scores risk, generates tailored apps & playbooks using all proprietary engines.'},
                  {name: 'policy_translation_engine', description: 'Translates complex policy into language that resonates with different demographic "tribes" while preserving facts.'},
                  {name: 'constituent_emotion_layering', description: 'Maps emotional undercurrents (anger, hope, fear, apathy) across communications, regions and time — privacy-preserving.'},
                  {name: 'knowledge_heat_map', description: 'Shows which parts of your knowledge base are heating up vs cooling off in real time.'},
                  {name: 'invisible_workflow_weaver', description: 'Discovers undocumented workflows from digital exhaust and turns them into shareable playbooks.'},
                  {name: 'opportunity_decay_clock', description: 'Assigns real-time half-lives to opportunities and recommends actions to extend their viability.'}
                ]).map((tool: any, idx: number) => (
                  <div key={idx} className="rounded-xl border border-white/10 bg-zinc-950/60 p-4 hover:border-emerald-500/30 transition-colors">
                    <div className="font-medium text-emerald-300 mb-1 flex items-center gap-2">
                      {tool.name === 'orchestra_tool' ? '🚀 ' : '⚙️ '} {tool.name === 'orchestra_tool' ? 'Orchestra Tool' : tool.name?.replace(/_/g, ' ')}
                    </div>
                    <div className="text-xs text-zinc-400 leading-relaxed">
                      {tool.description || 'Advanced proprietary capability built into Orchestrator.'}
                    </div>
                    {tool.name === 'orchestra_tool' && (
                      <div className="mt-2 text-[10px] text-emerald-400/70">Chains all other engines • Full action plans • Live in UI</div>
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-3 text-xs text-zinc-500">All capabilities (including Proprietary Ultra / Orchestra Tool + full OMNIS) are unlocked in this owner deployment. The purchaser integrates billing / sub-accounts as needed.</div>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          {/* COMPOSER - extracted (next layer) */}
          <div className="lg:col-span-2">
            <OrchestratorComposer
              user={user}
              profile={profile}
              task={task}
              setTask={setTask}
              images={images}
              setImages={setImages}
              previews={previews}
              setPreviews={setPreviews}
              autonomous={autonomous}
              setAutonomous={setAutonomous}
              loading={loading}
              error={error}
              setError={setError}
              onSubmit={handleSubmit}
              isPro={isPro}
              canSubmit={canSubmit}
              model={model}
              setModel={setModel}
              isPremium={isPremium}
              realtimeVisionEnabled={realtimeVisionEnabled}
              setRealtimeVisionEnabled={setRealtimeVisionEnabled}
              physicalWorldEnabled={physicalWorldEnabled}
              setPhysicalWorldEnabled={setPhysicalWorldEnabled}
              physicalControllerUrl={physicalControllerUrl}
              setPhysicalControllerUrl={setPhysicalControllerUrl}
              emotionalAwarenessEnabled={emotionalAwarenessEnabled}
              setEmotionalAwarenessEnabled={setEmotionalAwarenessEnabled}
              lifeOsModeEnabled={lifeOsModeEnabled}
              setLifeOsModeEnabled={setLifeOsModeEnabled}
              isCameraActive={isCameraActive}
              onStartCamera={startCamera}
              onStopCamera={stopCamera}
              onCaptureFrame={captureAndPushFrame}
              onToggleAutoFrames={toggleAutoFrames}
              liveRunId={liveRunId}
              isLiveRunning={isLiveRunning}
              isPushingFrame={isPushingFrame}
              registeredTools={registeredTools}
            />

            {/* Premium Real-time Vision live preview.
                The video element is mounted as soon as realtime is enabled so startCamera can attach the stream reliably. */}
            {isPremium && realtimeVisionEnabled && (
              <div className={`mt-2 rounded-lg border border-rose-500/30 bg-black/60 p-2 ${isCameraActive ? '' : 'opacity-60'}`}>
                <div className="text-[10px] uppercase tracking-widest text-rose-400 mb-1 px-1 flex items-center gap-2">
                  Live Camera (Premium)
                  {isCameraActive && <span className="text-emerald-400">● LIVE</span>}
                </div>
                <video
                  ref={videoRef}
                  className="w-full max-w-[320px] rounded border border-rose-500/40"
                  autoPlay
                  muted
                  playsInline
                  style={{ display: isCameraActive ? 'block' : 'none' }}
                />
                {!isCameraActive && (
                  <div className="h-20 flex items-center justify-center text-xs text-rose-300/70 border border-dashed border-rose-500/30 rounded">
                    Camera preview will appear after you press “Start Camera”
                  </div>
                )}
                <div className="text-[10px] text-rose-300/70 mt-1 px-1 font-medium">
                  ⚠️ Expensive feature. Each frame costs significant vision tokens. The agent sees them in real time as visual context.
                </div>
              </div>
            )}

            {/* One-shot result */}
            {oneShotResult && (
              <Card className="mt-4">
                <CardHeader>
                  <CardTitle className="text-base">Result</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-200">{oneShotResult}</div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* LIVE + TRACE VIEWER - extracted components for maintainability */}
          <div className="lg:col-span-3 space-y-4">
            <LiveExecution
              isLiveRunning={isLiveRunning}
              liveSteps={liveSteps}
              liveFinal={liveFinal}
              liveRunId={liveRunId}
              clearLive={clearLive}
            />

            <TraceViewer
              selectedRun={selectedRun}
              traceSteps={traceSteps}
              loadingTrace={loadingTrace}
              isTraceLive={isTraceLive}
              clearTrace={clearTrace}
              attachTraceRealtime={attachTraceRealtime}
            />

            <RecentRunsList
              user={user}
              recentRuns={recentRuns}
              loadingRuns={loadingRuns}
              loadRecentRuns={loadRecentRuns}
              loadTrace={loadTrace}
              usageEventsCount={usageEvents.length}
            />

            <UsageHistory usageEvents={usageEvents} />
          </div>
        </div>

        <div className="mt-8 text-center text-[10px] text-zinc-500">
          Steps are persisted to your Supabase DB in real time. The stream + realtime lets you watch the agent live.
          Full platform (all tiers + OMNIS + proprietary) unlocked for the owner / purchaser instance.
        </div>
      </div>

    </div>
  );
}
