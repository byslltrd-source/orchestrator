"use client";

import { useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { RecentRun, StepRow } from "@/lib/agent/types";

export function useRuns() {
  const supabase = createClient();
  const [recentRuns, setRecentRuns] = useState<RecentRun[]>([]);
  const [loadingRuns, setLoadingRuns] = useState(false);
  const [selectedRun, setSelectedRun] = useState<RecentRun | null>(null);
  const [traceSteps, setTraceSteps] = useState<StepRow[]>([]);
  const [loadingTrace, setLoadingTrace] = useState(false);
  const [isTraceLive, setIsTraceLive] = useState(false);

  const loadRecentRuns = useCallback(async (userId: string) => {
    if (!userId) return;
    setLoadingRuns(true);
    try {
      const { data, error } = await supabase
        .from("agent_runs")
        .select("id, status, started_at, completed_at, final_result, current_step, task_id, tasks(title, goal)")
        .eq("user_id", userId)
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
  }, [supabase]);

  const loadTrace = useCallback(async (run: RecentRun) => {
    setLoadingTrace(true);
    setSelectedRun(run);
    setTraceSteps([]);
    setIsTraceLive(false);

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

    if (run.status === "running") {
      // realtime attach handled in component
    }
  }, [supabase]);

  return {
    recentRuns,
    loadingRuns,
    loadRecentRuns,
    selectedRun,
    traceSteps,
    loadingTrace,
    loadTrace,
    isTraceLive,
    setIsTraceLive,
    setTraceSteps,
    setSelectedRun,
    setRecentRuns,
  };
}
