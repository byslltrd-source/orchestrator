// Copyright (c) 2026 Edward Marin. All rights reserved.
// This source code is proprietary. See LICENSE and the Commercial License Agreement for usage rights.

export type ToolCall = {
  name: string;
  arguments: Record<string, unknown>;
};

export type AgentStep = {
  type: 'thought' | 'tool_call' | 'tool_result' | 'memory' | 'final' | 'vision_frame';
  content?: string;
  toolName?: string;
  toolArgs?: Record<string, unknown> | unknown;
  toolResult?: string;
};

import type { StoredAsset } from '@/lib/supabase/storage';

export type RunAgentParams = {
  goal: string;
  userId: string;
  images?: (File | string | StoredAsset)[];   // support vision: local Files, urls, or rich StoredAsset from storage layer
  maxSteps?: number;
  taskId?: string;              // link to a persistent task
  runId?: string;               // if resuming
  onStep?: (step: AgentStep) => void | Promise<void>;
  /** Model id from the orchestrator model catalog (e.g. "grok", "claude-sonnet", "groq"). Falls back to default. */
  model?: string | null;
  /** If the customer explicitly opted into real-time vision for this run (premium, expensive feature). */
  realtimeVisionEnabled?: boolean;
  /** Physical World Integration (see + act on real hardware/IoT/robots). Requires Premium + realtimeVisionEnabled + explicit opt-in. High risk. */
  physicalWorldEnabled?: boolean;
  /** Per-run override for the physical/smart home controller (webhook URL). Stored in metadata. */
  physicalControllerUrl?: string | null;
  /** Emotional State Awareness: Agent tracks, logs, and responds to user's emotional state from text, conversation, and (if available) live vision. */
  emotionalAwarenessEnabled?: boolean;
  /** Personal Life OS Mode: Holistic mode where the agent acts as the user's Personal Life Operating System — managing tasks, emotions, physical environment, habits, goals, relationships, and proactively bridging digital + physical + emotional worlds. */
  lifeOsMode?: boolean;
};

export type RunAgentResult = {
  finalResult: string;
  steps: AgentStep[];
  runId?: string;
  usedSteps: number;
};

// UI / trace types (moved out of the giant page component for the next layer refactor)
export interface StepRow {
  id?: string;
  step_number: number;
  type: string;
  content?: string;
  tool_name?: string;
  tool_args?: Record<string, unknown> | unknown;
  tool_result?: string;
  created_at?: string;
}

export type LiveEvent =
  | { type: "run_started"; run_id: string; task_id: string; goal?: string }
  | { type: "step"; step: AgentStep; step_number: number }
  | { type: "done"; final_result: string; used_steps: number; run_id: string; task_id: string }
  | { type: "error"; error: string };

export interface RecentRun {
  id: string;
  status: string;
  started_at: string;
  completed_at?: string;
  final_result?: string;
  current_step?: number;
  task_id: string;
  tasks?: { title?: string; goal?: string };
}
