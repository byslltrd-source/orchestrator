"use client";

// Copyright (c) 2026 Edward Marin. All rights reserved.
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

  // Digital Lock for Orchestrator - only the owner (Edward Marin) has the password
  const [isOrchestratorUnlocked, setIsOrchestratorUnlocked] = useState(false);
  const [lockPassword, setLockPassword] = useState('');
  const [lockError, setLockError] = useState('');
  const [isUnlocking, setIsUnlocking] = useState(false);

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
  const isPremium = isProUser(profile); // Proprietary Ultra features (Orchestra Tool + proprietary suite) are available to premium profiles

  // Auth initialization
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

  // Load registered tools from Supabase so the list is always visible (tools live in DB + code on GitHub)
  useEffect(() => {
    if (!user) {
      setRegisteredTools([]);
      return;
    }
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
  }, [user, supabase]);

  // Digital Lock: Check if previously unlocked in this browser
  useEffect(() => {
    const wasUnlocked = localStorage.getItem('orchestratorUnlocked') === 'true';
    if (wasUnlocked) {
      setIsOrchestratorUnlocked(true);
    }
  }, []);

  // Handle unlocking Orchestrator with the secret owner password
  const handleOrchestratorUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lockPassword.trim()) {
      setLockError('Please enter the password.');
      return;
    }

    setIsUnlocking(true);
    setLockError('');

    try {
      const res = await fetch('/api/verify-lock', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password: lockPassword }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setIsOrchestratorUnlocked(true);
        localStorage.setItem('orchestratorUnlocked', 'true');
        setLockPassword('');
        setLockError('');
      } else {
        setLockError(data.error || 'Incorrect password. Only the owner has this password.');
      }
    } catch (err) {
      setLockError('Failed to verify password. Please try again.');
    } finally {
      setIsUnlocking(false);
    }
  };

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

        {/* DIGITAL LOCK - Orchestrator is locked with a private password only the owner knows */}
        {!isOrchestratorUnlocked ? (
          <div className="min-h-[70vh] flex items-center justify-center p-6">
            <div className="max-w-md w-full bg-zinc-950 border border-white/20 rounded-2xl p-8 text-center">
              <div className="text-6xl mb-6">🔒</div>
              <h1 className="text-3xl font-semibold tracking-tight mb-2">Orchestrator is Locked</h1>
              <p className="text-zinc-400 mb-8">This is a private digital lock. Only the owner (Edward Marin) knows the password.</p>

              <form onSubmit={handleOrchestratorUnlock} className="space-y-4">
                <input
                  type="password"
                  value={lockPassword}
                  onChange={(e) => setLockPassword(e.target.value)}
                  placeholder="Enter owner password"
                  className="w-full px-4 py-3 bg-black border border-white/20 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-white/40 text-lg"
                  disabled={isUnlocking}
                  autoFocus
                />

                <button
                  type="submit"
                  disabled={isUnlocking || !lockPassword.trim()}
                  className="w-full py-3 bg-white text-black font-medium rounded-xl hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isUnlocking ? 'Verifying...' : 'Unlock Orchestrator'}
                </button>
              </form>

              {lockError && (
                <p className="mt-4 text-red-400 text-sm">{lockError}</p>
              )}

              <p className="mt-6 text-[10px] text-zinc-500">
                This lock protects the full Orchestrator experience, including OMNIS and all proprietary features.
              </p>
            </div>
          </div>
        ) : (
          <>
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
                {/* Special OMNIS entry - only the name is visible (security requirement). Strongest tool. */}
                <div className="rounded-xl border-2 border-purple-500/40 bg-gradient-to-br from-purple-950/20 to-zinc-950 p-4">
                  <div className="font-mono text-xl tracking-[3px] text-purple-300 mb-1">OMNIS</div>
                  <div className="text-[10px] text-purple-400/70">The strongest tool available. $5,000 one-time lifetime for end users (customers). Source code only with Orchestrator purchase at sale.</div>
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
              <div className="mt-3 text-xs text-zinc-500">Sign up for Proprietary Ultra to unlock the full Orchestra Tool and all proprietary engines in your runs. See the integrated list in the composer below for details and pricing.</div>
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
          </>
        )}

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
