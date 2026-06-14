"use client";

import {
  Brain,
  Zap,
  Play,
  CheckCircle2,
  Camera,
  User,
  AlertTriangle,
  Scale,
  Eye,
  Flame,
  Clock,
  Scroll,
  Layers,
  DollarSign,
  Target,
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

  // === Magical Life OS Differentiators (from unique-features.html) ===
  if (t === "memory" && step.content?.includes("🧬 Current Biographical")) {
    return (
      <div key={index} className="rounded-lg border border-indigo-500/30 bg-indigo-950/40 p-4 text-sm">
        <div className="flex items-center gap-2 font-medium text-indigo-300 mb-2">
          <User className="h-4 w-4" /> Biographical Self-Model
        </div>
        <div className="text-indigo-200/90 whitespace-pre-wrap text-xs">{step.content}</div>
        <div className="text-[10px] text-indigo-400 mt-2">This model powers “What would you do?” simulations</div>
      </div>
    );
  }

  if (t === "memory" && step.content?.includes("👤 Shadow Agent")) {
    return (
      <div key={index} className="rounded-lg border border-emerald-500/30 bg-emerald-950/30 p-4 text-sm">
        <div className="flex items-center gap-2 font-medium text-emerald-300 mb-2">
          <Eye className="h-4 w-4" /> Shadow Agent Insight
        </div>
        <div className="text-emerald-200/90 italic">{step.content.replace('👤 Shadow Agent: ', '')}</div>
        <div className="text-[10px] text-emerald-400 mt-1">Quietly observed • Only surfaced because it mattered</div>
      </div>
    );
  }

  if (t === "memory" && step.content?.includes("🔄 Regret Minimization")) {
    return (
      <div key={index} className="rounded-lg border border-amber-500/30 bg-amber-950/30 p-4 text-sm">
        <div className="flex items-center gap-2 font-medium text-amber-300 mb-2">
          <AlertTriangle className="h-4 w-4" /> Regret Minimization Engine
        </div>
        <div className="text-amber-200/90 text-xs whitespace-pre-wrap">{step.content}</div>
      </div>
    );
  }

  if (t === "memory" && step.content?.includes("🪞 Ethical Mirror")) {
    return (
      <div key={index} className="rounded-lg border border-violet-500/30 bg-violet-950/30 p-4 text-sm">
        <div className="flex items-center gap-2 font-medium text-violet-300 mb-2">
          <Scale className="h-4 w-4" /> Ethical Mirror
        </div>
        <div className="text-violet-200/90 text-xs whitespace-pre-wrap">{step.content}</div>
        <div className="text-[10px] text-violet-400 mt-1">Future self &amp; loved ones perspective</div>
      </div>
    );
  }

  // === Proprietary Strategic Tools (from proprietary-features.html, Ultra exclusive) ===
  if (t === "memory" && step.content?.includes("🔥 Knowledge Heat Map")) {
    return (
      <div key={index} className="rounded-lg border border-orange-500/30 bg-orange-950/30 p-4 text-sm">
        <div className="flex items-center gap-2 font-medium text-orange-300 mb-2">
          <Flame className="h-4 w-4" /> Knowledge Heat Map (Proprietary)
        </div>
        <div className="text-orange-200/90 text-xs whitespace-pre-wrap">{step.content.replace('🔥 Knowledge Heat Map', '').replace('(end of run):', '').replace(':', '')}</div>
        <div className="text-[10px] text-orange-400 mt-1">Heating vs cooling knowledge • Ultra Premium IP</div>
      </div>
    );
  }

  if (t === "memory" && step.content?.includes("⏳ Opportunity Decay Clock")) {
    return (
      <div key={index} className="rounded-lg border border-teal-500/30 bg-teal-950/30 p-4 text-sm">
        <div className="flex items-center gap-2 font-medium text-teal-300 mb-2">
          <Clock className="h-4 w-4" /> Opportunity Decay Clock (Proprietary)
        </div>
        <div className="text-teal-200/90 text-xs whitespace-pre-wrap">{step.content}</div>
        <div className="text-[10px] text-teal-400 mt-1">Half-lives + refresh actions • Ultra Premium IP</div>
      </div>
    );
  }

  if (t === "memory" && (step.content?.includes("📜 Policy Translation") || step.content?.includes("Policy Translation Engine"))) {
    return (
      <div key={index} className="rounded-lg border border-rose-500/30 bg-rose-950/30 p-4 text-sm">
        <div className="flex items-center gap-2 font-medium text-rose-300 mb-2">
          <Scroll className="h-4 w-4" /> Policy Translation Engine (Proprietary)
        </div>
        <div className="text-rose-200/90 text-xs whitespace-pre-wrap">{step.content}</div>
        <div className="text-[10px] text-rose-400 mt-1">Tribal resonance while preserving facts • Ultra Premium IP</div>
      </div>
    );
  }

  if (t === "memory" && (step.content?.includes("Constituent Emotion Layering") || step.content?.includes("emotional undercurrents"))) {
    return (
      <div key={index} className="rounded-lg border border-fuchsia-500/30 bg-fuchsia-950/30 p-4 text-sm">
        <div className="flex items-center gap-2 font-medium text-fuchsia-300 mb-2">
          <Layers className="h-4 w-4" /> Constituent Emotion Layering (Proprietary)
        </div>
        <div className="text-fuchsia-200/90 text-xs whitespace-pre-wrap">{step.content}</div>
        <div className="text-[10px] text-fuchsia-400 mt-1">Privacy-preserving emotional terrain map • Ultra Premium IP</div>
      </div>
    );
  }

  if (t === "memory" && (step.content?.includes("Invisible Workflow Weaver") || step.content?.includes("PLAYBOOK:") || step.content?.includes("playbook"))) {
    return (
      <div key={index} className="rounded-lg border border-sky-500/30 bg-sky-950/30 p-4 text-sm">
        <div className="flex items-center gap-2 font-medium text-sky-300 mb-2">
          <Layers className="h-4 w-4" /> Invisible Workflow Weaver (Proprietary)
        </div>
        <div className="text-sky-200/90 text-xs whitespace-pre-wrap">{step.content}</div>
        <div className="text-[10px] text-sky-400 mt-1">Hidden processes → shareable playbooks • Ultra Premium IP</div>
      </div>
    );
  }

  // Orchestra Tool (Funding Forge) — flagship proprietary tool (powered by all 5 engines)
  if (t === "memory" && (step.content?.includes("ORCHESTRA TOOL REPORT") || step.content?.includes("orchestra_tool") || step.content?.includes("Orchestra Tool") || step.content?.includes("ORCHESTRA TOOL"))) {
    return (
      <div key={index} className="rounded-xl border border-emerald-500/40 bg-emerald-950/40 p-4 text-sm">
        <div className="flex items-center gap-2 font-semibold text-emerald-300 mb-2">
          <DollarSign className="h-4 w-4" /> <Target className="h-4 w-4" /> ORCHESTRA TOOL — Built-in to Orchestrator (Proprietary Ultra)
        </div>
        <div className="text-emerald-200/90 text-xs whitespace-pre-wrap max-h-80 overflow-auto">{step.content}</div>
        <div className="text-[10px] text-emerald-400 mt-2 font-medium">Autonomous opportunity hunter + application factory + risk engine • Chains Policy Translation • Heat Map • Decay Clock • Workflow Weaver • Emotion Layering</div>
      </div>
    );
  }

  // OMNIS — the strongest tool (transcendent, dedicated rendering)
  // Only the name "OMNIS" was ever shown in the UI (per security rules).
  if (t === "memory" && (step.content?.includes("OMNIS:") || step.content?.includes("OMNIS\n") || step.content?.toUpperCase().includes("OMNIS SYNTHESIS") || step.content?.includes("transcendent synthesis from OMNIS"))) {
    return (
      <div key={index} className="rounded-2xl border-2 border-purple-500/50 bg-gradient-to-br from-purple-950/40 via-black to-purple-950/30 p-5 text-sm shadow-inner">
        <div className="flex items-center gap-3 font-mono text-2xl tracking-[4px] text-purple-300 mb-3">
          OMNIS
        </div>
        <div className="text-purple-100/95 text-sm leading-relaxed whitespace-pre-wrap max-h-[420px] overflow-auto pr-2 border-l-2 border-purple-500/30 pl-3">
          {step.content.replace('OMNIS:\n\n', '').replace('[This is the complete, transcendent synthesis from OMNIS — the strongest tool. It has accessed and integrated the user\'s entire Orchestrator-captured existence.]', '')}
        </div>
        <div className="mt-3 text-[10px] text-purple-400/70 font-mono tracking-widest border-t border-purple-500/20 pt-2">
          THE STRONGEST TOOL • OMNISCIENCE • OMNIPOTENCE • OMNIPRESENCE • TOTAL SYNTHESIS
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
