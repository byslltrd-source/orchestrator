"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, CheckCircle2 } from "lucide-react";
import { StepRenderer } from "./StepRenderer";

interface LiveExecutionProps {
  isLiveRunning: boolean;
  liveSteps: any[];
  liveFinal: string | null;
  liveRunId: string | null;
  clearLive: () => void;
}

export function LiveExecution({ isLiveRunning, liveSteps, liveFinal, liveRunId, clearLive }: LiveExecutionProps) {
  if (!isLiveRunning && liveSteps.length === 0 && !liveFinal) return null;

  return (
    <Card className="border-white/20">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            {isLiveRunning ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin text-emerald-400" /> Live Agent Execution
              </>
            ) : (
              "Agent Execution"
            )}
          </CardTitle>
          {liveRunId && (
            <CardDescription className="font-mono text-[10px] text-zinc-500 mt-0.5">
              run {liveRunId.slice(0, 8)}… {liveFinal ? "· completed" : ""}
            </CardDescription>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={clearLive}>
          Clear
        </Button>
      </CardHeader>
      <CardContent>
        {isLiveRunning && liveSteps.length === 0 && (
          <div className="flex items-center gap-2 text-sm text-zinc-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Agent is starting — first thoughts and tool calls will appear here live...
          </div>
        )}

        <div className="space-y-3">
          {liveSteps.map((s, i) => <StepRenderer key={i} step={s} index={i} />)}
        </div>

        {liveFinal && (
          <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm">
            <div className="font-semibold text-emerald-400 mb-1 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" /> Complete
            </div>
            <div className="whitespace-pre-wrap text-emerald-100/90">{liveFinal}</div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
