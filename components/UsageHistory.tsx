"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { History } from "lucide-react";

interface UsageEvent {
  id: string;
  type: string;
  task?: string;
  result_preview?: string;
  images_count?: number;
  created_at: string;
}

interface UsageHistoryProps {
  usageEvents: UsageEvent[];
}

export function UsageHistory({ usageEvents }: UsageHistoryProps) {
  if (usageEvents.length === 0) return null;

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="h-4 w-4" /> Recent Usage History
        </CardTitle>
        <CardDescription className="text-xs">All orchestrations (one-shot and autonomous) are logged for audit and quota tracking.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 text-sm">
          {usageEvents.slice(0, 5).map((event) => (
            <div key={event.id} className="rounded border border-white/10 p-2">
              <div className="flex justify-between">
                <span className="font-mono text-[10px] text-zinc-500">{event.id.slice(0, 8)}</span>
                <span className="text-[10px] text-zinc-400">{new Date(event.created_at).toLocaleString()}</span>
              </div>
              <div className="mt-1 truncate text-zinc-300">{event.task || "(no task)"}</div>
              <div className="text-[10px] text-zinc-500">
                {event.type} · {event.images_count || 0} images · {event.result_preview?.slice(0, 80)}...
              </div>
            </div>
          ))}
        </div>
        {usageEvents.length > 5 && (
          <div className="mt-2 text-[10px] text-zinc-500 text-center">... and more in your database</div>
        )}
      </CardContent>
    </Card>
  );
}
