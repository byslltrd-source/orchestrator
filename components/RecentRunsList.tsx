"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { History, Eye } from "lucide-react";
import type { RecentRun } from "@/lib/agent/types";

interface RecentRunsListProps {
  user: any;
  recentRuns: RecentRun[];
  loadingRuns: boolean;
  loadRecentRuns: () => void;
  loadTrace: (run: RecentRun) => void;
  usageEventsCount?: number;
}

export function RecentRunsList({
  user,
  recentRuns,
  loadingRuns,
  loadRecentRuns,
  loadTrace,
  usageEventsCount = 0,
}: RecentRunsListProps) {
  return (
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
          <div className="text-sm text-zinc-400">Owner context required for run history.</div>
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

        {usageEventsCount > 0 && (
          <div className="mt-3 text-[10px] text-zinc-500">
            + {usageEventsCount} recent usage events logged (one-shot + autonomous).
          </div>
        )}
      </CardContent>
    </Card>
  );
}
