"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { StepRenderer } from "./StepRenderer";
import type { StepRow, RecentRun } from "@/lib/agent/types";

interface TraceViewerProps {
  selectedRun: RecentRun | null;
  traceSteps: StepRow[];
  loadingTrace: boolean;
  isTraceLive: boolean;
  clearTrace: () => void;
  attachTraceRealtime: (runId: string) => void;
}

export function TraceViewer({
  selectedRun,
  traceSteps,
  loadingTrace,
  isTraceLive,
  clearTrace,
  attachTraceRealtime,
}: TraceViewerProps) {
  if (!selectedRun) return null;

  return (
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
  );
}
