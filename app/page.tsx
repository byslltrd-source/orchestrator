"use client";

// Copyright (c) 2026 [Your Name or Company]. All rights reserved.
// This source code is proprietary. See LICENSE and the Commercial License Agreement for usage rights.

import { useState, useEffect, useRef, useCallback } from "react";

// Fully client-side authenticated experience — force dynamic to avoid build-time prerender
// that would execute the Supabase browser client without env vars present.
export const dynamic = "force-dynamic";
import { Header } from "@/components/Header";
import { AuthModal } from "@/components/AuthModal";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";
import type { AgentStep, StepRow, LiveEvent, RecentRun } from "@/lib/agent/types";
import { isProUser, isPremiumUser, type UserProfile } from "@/lib/utils";
import { MAX_IMAGE_UPLOAD_BYTES, MAX_IMAGES_FREE } from "@/lib/constants";
import { OrchestratorComposer } from "@/components/OrchestratorComposer";
import { LiveExecution } from "@/components/LiveExecution";
import { TraceViewer } from "@/components/TraceViewer";
import { RecentRunsList } from "@/components/RecentRunsList";
import { UsageHistory } from "@/components/UsageHistory";
import { useProfile } from "@/lib/hooks/useProfile";
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

  // Auth
  const [user, setUser] = useState<User | null>(null);
  const { profile, loadProfile: loadProfileHook, setProfile } = useProfile();
  const [isAuthOpen, setIsAuthOpen] = useState(false);

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
  const isPremium = isPremiumUser(profile);
  const [realtimeVisionEnabled, setRealtimeVisionEnabled] = useState(false);
  const [physicalWorldEnabled, setPhysicalWorldEnabled] = useState(false); // Requires realtimeVisionEnabled + premium. High risk/expensive.
  const [physicalControllerUrl, setPhysicalControllerUrl] = useState(''); // per-run override for smart home / physical controller
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
    if (user?.id) loadRecentRunsWithId(user.id);
  }, [user?.id, loadRecentRunsWithId]);

  // Usage history (full next layer)
  const [usageEvents, setUsageEvents] = useState<any[]>([]);

  const loadUsageEvents = useCallback(async () => {
    if (!user) return;
    try {
      const { data } = await supabase
        .from("usage_events")
        .select("id, type, task, result_preview, images_count, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(5);
      if (data) setUsageEvents(data);
    } catch {}
  }, [supabase, user]);

  // Realtime channel refs for cleanup
  const liveChannelRef = useRef<any>(null);
  const traceChannelRef = useRef<any>(null);

  const isPro = isProUser(profile);

  // Auth initialization (restored for HTTPS dev stability and to ensure user state loads)
  useEffect(() => {
    // Initial session
    supabase.auth.getUser().then(({ data }: { data: { user: User | null } }) => {
      const u = data.user;
      setUser(u);
      if (u) {
        loadProfileHook(u.id);
        if (u.id) loadRecentRunsWithId(u.id);
        loadUsageEvents();
      }
    });

    // Listen for auth changes
    const { data: listener } = supabase.auth.onAuthStateChange((_event: any, session: any) => {
      const u = session?.user ?? null;
      setUser(u);
      if (u) {
        loadProfileHook(u.id);
        if (u.id) loadRecentRunsWithId(u.id);
        loadUsageEvents();
      } else {
        setProfile(null);
        setRecentRuns([]);
        setUsageEvents([]);
        clearLive();
        clearTrace();
      }
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  // Cleanup camera on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  // When customer opts into real-time vision (expensive), set profile consent if not already set.
  // This acts as a master "I understand this is expensive" switch at profile level.
  useEffect(() => {
    if (!realtimeVisionEnabled || !user || !isPremium || !profile) return;
    if (profile.realtime_vision_consent) return;

    (async () => {
      try {
        await supabase
          .from('profiles')
          .update({ realtime_vision_consent: true })
          .eq('id', user.id);
        // Refresh profile so UI updates immediately
        loadProfileHook(user.id);
      } catch (e) {
        // non fatal
      }
    })();
  }, [realtimeVisionEnabled, user, isPremium, profile, supabase]);

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
    if (!user || !task.trim()) {
      setError("Sign in and enter a task.");
      return;
    }
    if (autonomous && !isPro) {
      setError("Autonomous agents are a Pro feature. Upgrade in the header.");
      return;
    }

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

  const canSubmit = !!user && task.trim().length > 0 && !loading;

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <Header onAuthClick={() => setIsAuthOpen(true)} onUserChange={setUser} />

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
              isCameraActive={isCameraActive}
              onStartCamera={startCamera}
              onStopCamera={stopCamera}
              onCaptureFrame={captureAndPushFrame}
              onToggleAutoFrames={toggleAutoFrames}
              liveRunId={liveRunId}
              isLiveRunning={isLiveRunning}
              isPushingFrame={isPushingFrame}
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
          {isPro === false && " Upgrade for unlimited autonomous runs + tools."}
        </div>
      </div>

      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onAuthSuccess={() => {
          setIsAuthOpen(false);
          // Header will call onUserChange which triggers loads
        }}
      />
    </div>
  );
}
