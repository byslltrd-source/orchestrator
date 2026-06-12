"use client";

import {
  Brain,
  Zap,
  Play,
  CheckCircle2,
  Camera,
} from "lucide-react";
import type { AgentStep, StepRow } from "@/lib/agent/types";

interface StepRendererProps {
  step: StepRow | (AgentStep & { step_number?: number });
  index: number;
}

export function StepRenderer({ step, index }: StepRendererProps) {
  const num = (step as any).step_number ?? index + 1;
  const t = step.type;

  if (t === "memory") {
    return (
      <div key={index} className="flex gap-3 rounded-lg border border-sky-500/20 bg-sky-500/5 p-3 text-sm">
        <Brain className="mt-0.5 h-4 w-4 text-sky-400" />
        <div className="flex-1">
          <div className="font-medium text-sky-300">Memory #{num}</div>
          <div className="mt-1 text-sky-200/90">{step.content}</div>
        </div>
      </div>
    );
  }

  if (t === "vision_frame") {
    const url = step.content;
    const isImageUrl = typeof url === "string" && (url.startsWith("http") || url.startsWith("data:"));
    return (
      <div key={index} className="flex gap-3 rounded-lg border border-rose-500/20 bg-rose-500/5 p-3 text-sm">
        <Camera className="mt-0.5 h-4 w-4 text-rose-400" />
        <div className="flex-1">
          <div className="font-medium text-rose-300">Live Vision #{num}</div>
          <div className="mt-1 text-rose-200/90 text-xs">Real-time camera frame (Premium)</div>
          {isImageUrl ? (
            <img
              src={url}
              alt="Live vision frame"
              className="mt-2 max-h-40 rounded border border-rose-500/30 object-contain"
            />
          ) : (
            <div className="mt-1 text-xs text-rose-200/70">{url}</div>
          )}
        </div>
      </div>
    );
  }

  if (t === "thought") {
    return (
      <div key={index} className="rounded-lg border border-white/10 bg-zinc-900/60 p-3 text-sm">
        <div className="mb-1 flex items-center gap-2 text-[10px] uppercase tracking-[1px] text-amber-400">
          <Zap className="h-3 w-3" /> Thought #{num}
        </div>
        <div className="whitespace-pre-wrap text-zinc-300 italic">{step.content}</div>
      </div>
    );
  }

  if (t === "tool_call") {
    const toolName = (step as any).toolName || (step as any).tool_name;
    const toolArgs = (step as any).toolArgs || (step as any).tool_args;
    return (
      <div key={index} className="rounded-lg border border-violet-500/20 bg-violet-500/5 p-3 text-sm">
        <div className="mb-1 flex items-center gap-2 font-medium text-violet-300">
          <Play className="h-3.5 w-3.5" /> Tool call #{num}: <span className="font-mono text-violet-200">{toolName}</span>
        </div>
        {toolArgs ? (
          <pre className="mt-1 overflow-x-auto rounded bg-black/40 p-2 text-[11px] text-violet-200/80">
            {JSON.stringify(toolArgs, null, 2)}
          </pre>
        ) : null}
      </div>
    );
  }

  if (t === "tool_result") {
    const res = (step as any).toolResult || (step as any).tool_result;
    return (
      <div key={index} className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-sm">
        <div className="mb-1 text-[10px] uppercase tracking-widest text-emerald-400">Result #{num}</div>
        <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded bg-black/30 p-2 text-xs text-emerald-200/90">
          {typeof res === "string" ? res : JSON.stringify(res, null, 2)}
        </pre>
      </div>
    );
  }

  if (t === "final") {
    return (
      <div key={index} className="rounded-xl border border-white/20 bg-white/5 p-4">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-white">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" /> Final Answer
        </div>
        <div className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-100">{step.content}</div>
      </div>
    );
  }

  // fallback
  return (
    <div key={index} className="rounded border border-white/10 p-2 text-xs text-zinc-400">
      #{num} {t}: {step.content || JSON.stringify(step).slice(0, 120)}
    </div>
  );
}
