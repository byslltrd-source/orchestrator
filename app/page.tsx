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
import { isProUser, type UserProfile } from "@/lib/utils";
import { MAX_IMAGE_UPLOAD_BYTES, MAX_IMAGES_FREE } from "@/lib/constants";
import { StepRenderer } from "@/components/StepRenderer";
import { OrchestratorComposer } from "@/components/OrchestratorComposer";
import { LiveExecution } from "@/components/LiveExecution";
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
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isAuthOpen, setIsAuthOpen] = useState(false);

  // Composer
  const [task, setTask] = useState("");
  const [images, setImages] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [autonomous, setAutonomous] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // One-shot result
  const [oneShotResult, setOneShotResult] = useState<string | null>(null);

  // Live autonomous (from current submit stream)
  const [liveRunId, setLiveRunId] = useState<string | null>(null);
  const [liveSteps, setLiveSteps] = useState<(AgentStep & { step_number?: number })[]>([]);
  const [isLiveRunning, setIsLiveRunning] = useState(false);
  const [liveFinal, setLiveFinal] = useState<string | null>(null);

  // History + trace viewer
  const [recentRuns, setRecentRuns] = useState<RecentRun[]>([]);
  const [loadingRuns, setLoadingRuns] = useState(false);
  const [selectedRun, setSelectedRun] = useState<RecentRun | null>(null);
  const [traceSteps, setTraceSteps] = useState<StepRow[]>([]);
  const [loadingTrace, setLoadingTrace] = useState(false);
  const [isTraceLive, setIsTraceLive] = useState(false);

  // Usage history (next layer)
  const [usageEvents, setUsageEvents] = useState<any[]>([]);

  // Realtime channel refs for cleanup
  const liveChannelRef = useRef<any>(null);
  const traceChannelRef = useRef<any>(null);

  const isPro = isProUser(profile);

  // Load profile (for composer hints)
  const loadProfile = useCallback(async (userId: string) => {
    try {
      const { data } = await supabase
        .from("profiles")
        .select("subscription_plan, subscription_status, orchestrations_used, orchestrations_limit")
        .eq("id", userId)
        .single();
      if (data) setProfile(data as Profile);
    } catch {}
  }, [supabase]);

  // Load recent autonomous runs for this user
  const loadRecentRuns = useCallback(async () => {
    if (!user) return;
    setLoadingRuns(true);
    try {
      const { data, error } = await supabase
        .from("agent_runs")
        .select("id, status, started_at, completed_at, final_result, current_step, task_id, tasks(title, goal)")
        .eq("user_id", user.id)
        .order("started_at", { ascending: false })
        .limit(8);
      if (!error && data) {
        setRecentRuns(data as RecentRun[]);
      }
    } catch {
      // ignore
    } finally {
      setLoadingRuns(false);
    }
  }, [supabase, user]);

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

  // Load full trace for a past/current run from DB
  async function loadTrace(run: RecentRun) {
    setLoadingTrace(true);
    setSelectedRun(run);
    setTraceSteps([]);
    setIsTraceLive(false);

    // cleanup previous trace sub
    if (traceChannelRef.current) {
      supabase.removeChannel(traceChannelRef.current);
      traceChannelRef.current = null;
    }

    try {
      const { data: steps, error } = await supabase
        .from("agent_steps")
        .select("id, step_number, type, content, tool_name, tool_args, tool_result, created_at")
        .eq("run_id", run.id)
        .order("step_number", { ascending: true });

      if (!error && steps) {
        setTraceSteps(steps as StepRow[]);
      }
    } catch {}

    setLoadingTrace(false);

    // If still running, attach realtime so you can literally watch it live
    if (run.status === "running") {
      attachTraceRealtime(run.id);
    }
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
            // avoid dups
            if (prev.some((s) => s.step_number === newStep.step_number)) return prev;
            return [...prev, newStep].sort((a, b) => (a.step_number || 0) - (b.step_number || 0));
          });
        }
      )
      .subscribe();

    traceChannelRef.current = ch;
  }

  // Attach optional realtime for the current live run (resilience + multi-tab)
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
                loadRecentRuns();
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

  function clearLive() {
    setLiveSteps([]);
    setLiveRunId(null);
    setLiveFinal(null);
    setIsLiveRunning(false);
    if (liveChannelRef.current) {
      supabase.removeChannel(liveChannelRef.current);
      liveChannelRef.current = null;
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

  // When user changes (from Header), load data.
  // load* are useCallback-wrapped; the dep on loadRecentRuns (which internally closes over user) is intentional here.
  // The setProfile etc inside the called load functions are async (await + setState), so not a sync cascade.
  useEffect(() => {
    if (user) {
      loadProfile(user.id);
      loadRecentRuns();
      loadUsageEvents();
    } else {
      setProfile(null);
      setRecentRuns([]);
      // clear any live state on signout
      clearLive();
      clearTrace();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, loadProfile, loadRecentRuns]);

  // Cleanup channels on unmount
  useEffect(() => {
    return () => {
      cleanupChannels();
      previews.forEach((p) => URL.revokeObjectURL(p));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
            />

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

          {/* LIVE + TRACE VIEWER */}
          <div className="lg:col-span-3 space-y-4">
            {/* LIVE EXECUTION - extracted component */}
            <LiveExecution
              isLiveRunning={isLiveRunning}
              liveSteps={liveSteps}
              liveFinal={liveFinal}
              liveRunId={liveRunId}
              clearLive={clearLive}
            />

            {/* SELECTED TRACE VIEWER (history + live attach) */}
            {selectedRun && (
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      Trace for run <span className="font-mono text-xs text-zinc-500">{selectedRun.id.slice(0, 8)}</span>
                      {isTraceLive && <span className="text-[10px] rounded bg-emerald-500/20 px-1.5 py-px text-emerald-400">LIVE</span>}
                    </CardTitle>
                    <CardDescription className="text-xs">
                      {selectedRun.tasks?.goal || selectedRun.tasks?.title || "Goal"} · status: {selectedRun.status}
                    </CardDescription>
                  </div>
                  <Button variant="ghost" size="sm" onClick={clearTrace}>
                    Close
                  </Button>
                </CardHeader>
                <CardContent>
                  {loadingTrace && traceSteps.length === 0 ? (
                    <div className="text-sm text-zinc-400">Loading trace…</div>
                  ) : (
                    <div className="space-y-3">
                      {traceSteps.length === 0 && <div className="text-sm text-zinc-500">No steps recorded yet.</div>}
                      {traceSteps.map((s, i) => <StepRenderer key={i} step={s} index={i} />)}
                    </div>
                  )}
                  {selectedRun.status === "running" && !isTraceLive && (
                    <div className="mt-3">
                      <Button size="sm" variant="outline" onClick={() => attachTraceRealtime(selectedRun.id)}>
                        Attach live updates
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* RECENT AUTONOMOUS RUNS */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <History className="h-4 w-4" /> Recent Autonomous Runs
                  </CardTitle>
                  <Button variant="ghost" size="sm" onClick={loadRecentRuns} disabled={loadingRuns}>
                    {loadingRuns ? "Refreshing..." : "Refresh"}
                  </Button>
                </div>
                <CardDescription className="text-xs">Click View to see the full saved trace. Running ones can be watched live.</CardDescription>
              </CardHeader>
              <CardContent>
                {!user ? (
                  <div className="text-sm text-zinc-400">Sign in to see your autonomous run history.</div>
                ) : recentRuns.length === 0 ? (
                  <div className="text-sm text-zinc-400">No autonomous runs yet. Check the box and submit a Pro task.</div>
                ) : (
                  <div className="space-y-2">
                    {recentRuns.map((r) => {
                      const goal = r.tasks?.goal || r.tasks?.title || "(goal)";
                      const isRunning = r.status === "running";
                      return (
                        <div
                          key={r.id}
                          className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-lg border border-white/10 bg-zinc-900/50 px-3 py-2 text-sm"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-[10px] text-zinc-500">{r.id.slice(0, 8)}</span>
                              <span className={`inline-block rounded px-1.5 py-px text-[10px] ${isRunning ? "bg-emerald-500/20 text-emerald-400" : r.status === "completed" ? "bg-white/10 text-white/70" : "bg-red-500/20 text-red-400"}`}>
                                {r.status}
                              </span>
                              {isRunning && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />}
                            </div>
                            <div className="truncate text-zinc-300 mt-0.5">{goal}</div>
                            <div className="text-[10px] text-zinc-500 mt-0.5">
                              {new Date(r.started_at).toLocaleString()} {r.completed_at ? "→ " + new Date(r.completed_at).toLocaleTimeString() : ""}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {r.final_result && (
                              <div className="hidden max-w-[220px] truncate text-xs text-zinc-400 sm:block pr-2 border-r border-white/10">
                                {r.final_result.slice(0, 90)}…
                              </div>
                            )}
                            <Button size="sm" variant="outline" onClick={() => loadTrace(r)}>
                              <Eye className="mr-1.5 h-3.5 w-3.5" /> View trace
                            </Button>
                            {isRunning && (
                              <Button size="sm" onClick={() => loadTrace(r)}>
                                Watch live
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {usageEvents.length > 0 && (
                  <div className="mt-3 text-[10px] text-zinc-500">
                    + {usageEvents.length} recent usage events logged (one-shot + autonomous).
                  </div>
                )}
              </CardContent>
            </Card>
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
