import OpenAI from 'openai';
import {
  ORCHESTRATOR_MODELS,
  DEFAULT_ORCHESTRATOR_MODEL_ID,
  type OrchestratorModelId,
} from './models';
import { DEFAULT_MODEL as DEFAULT_MODEL_CONST, EMBEDDING_MODEL } from '@/lib/constants';

const DEFAULT_MODEL = DEFAULT_MODEL_CONST;

export interface ResolvedLLM {
  client: OpenAI;
  model: string;
  label: string;
  id: string;
  supportsVision: boolean;
}

export interface ResolvedEmbedder {
  client: OpenAI;
  model: string;
}

/**
 * Resolve the main orchestrator LLM client + model for a user-selected id (or default).
 * Supports curated presets + full custom via environment variables:
 *   ORCHESTRATOR_MODEL, ORCHESTRATOR_BASE_URL, ORCHESTRATOR_API_KEY
 *
 * Falls back gracefully to classic OPENAI_* variables.
 */
export function resolveOrchestratorLLM(requestedId?: string | null): ResolvedLLM {
  const id = (requestedId && requestedId in ORCHESTRATOR_MODELS)
    ? (requestedId as OrchestratorModelId)
    : DEFAULT_ORCHESTRATOR_MODEL_ID;

  const def = ORCHESTRATOR_MODELS[id] as (typeof ORCHESTRATOR_MODELS)[OrchestratorModelId];

  // Determine the actual model string (runtime override for custom + env fallbacks)
  let model: string = def.model;
  if (id === 'custom' || !model || model === 'custom') {
    model = process.env.ORCHESTRATOR_MODEL || process.env.OPENAI_MODEL || DEFAULT_MODEL;
  }

  // Key resolution: specific env for the preset -> ORCHESTRATOR_API_KEY -> OPENAI_API_KEY
  const specificKeyEnv = (def as any).apiKeyEnv as string | undefined;
  const apiKey =
    (specificKeyEnv && process.env[specificKeyEnv]) ||
    process.env.ORCHESTRATOR_API_KEY ||
    process.env.OPENAI_API_KEY;

  if (!apiKey) {
    if (process.env.BYPASS_SUPABASE_CHECK === 'true' || process.env.NEXT_PUBLIC_BYPASS_SUPABASE_CHECK === 'true') {
      // Stub LLM for test mode
      return {
        client: { chat: { completions: { create: async () => ({ choices: [{ message: { content: 'Test mode simulation response.' } }] }) } } } as any,
        model: 'gpt-4o-mini',
        label: 'Test Mode',
        id,
        supportsVision: true,
      };
    }
    throw new Error(
      `No API key found for model "${id}". Set ${specificKeyEnv || 'ORCHESTRATOR_API_KEY'} or OPENAI_API_KEY.`
    );
  }

  // baseURL: preset -> ORCHESTRATOR_BASE_URL -> undefined (official OpenAI)
  const baseURL = (def as any).baseURL as string | undefined || process.env.ORCHESTRATOR_BASE_URL || undefined;

  const client = new OpenAI({
    apiKey,
    ...(baseURL ? { baseURL } : {}),
  });

  return {
    client,
    model,
    label: def.label || id,
    id,
    supportsVision: def.supportsVision ?? true,
  };
}

/**
 * Dedicated embedder (used for memory vector search).
 * You can point this at a cheap consistent embedding provider without changing the main agent model.
 * Defaults to OpenAI text-embedding-3-small for quality + compatibility with existing pgvector setup.
 */
export function getEmbedder(): ResolvedEmbedder {
  const apiKey =
    process.env.EMBEDDING_API_KEY ||
    process.env.ORCHESTRATOR_API_KEY ||
    process.env.OPENAI_API_KEY;

  if (!apiKey) {
    if (process.env.BYPASS_SUPABASE_CHECK === 'true' || process.env.NEXT_PUBLIC_BYPASS_SUPABASE_CHECK === 'true') {
      // Stub embedder for test mode - memory ops will be skipped or simulated in tools
      return {
        client: { embeddings: { create: async () => ({ data: [{ embedding: new Array(1536).fill(0) }] }) } } as any,
        model: 'text-embedding-3-small',
      };
    }
    throw new Error('No embedding API key available (EMBEDDING_API_KEY or OPENAI_API_KEY).');
  }

  const baseURL = process.env.EMBEDDING_BASE_URL;
  const client = new OpenAI({
    apiKey,
    ...(baseURL ? { baseURL } : {}),
  });

  const model = process.env.EMBEDDING_MODEL || EMBEDDING_MODEL;

  return { client, model };
}

/**
 * Convenience: get a fast/cheap client for internal tool use (e.g. page summarization).
 * Currently re-uses the orchestrator resolver but you can hardcode a cheap id here later.
 */
export function resolveToolLLM(requestedId?: string | null) {
  // For now, tool calls inside the agent (like browse summarizer) use the same chosen model
  // for consistency. Change to a fixed cheap id (e.g. 'default') if you prefer separate billing/speed.
  return resolveOrchestratorLLM(requestedId);
}

/**
 * Summarize a live vision frame using a cheap model (VISION_SUMMARIZER_MODEL).
 * Used for Real-time Vision feature to reduce token costs while still providing useful context
 * (and the raw image can still be sent to the main model).
 * Returns a concise description.
 */
export async function summarizeVisionFrame(imageUrl: string): Promise<string> {
  try {
    const apiKey = process.env.OPENAI_API_KEY || process.env.ORCHESTRATOR_API_KEY;
    if (!apiKey) return 'Live frame received (no summarizer key configured).';

    const summarizer = new OpenAI({ apiKey });

    const res = await summarizer.chat.completions.create({
      model: process.env.VISION_SUMMARIZER_MODEL || 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Provide a concise, actionable description of this live camera frame for an autonomous AI agent. Include key visible objects, text, UI elements, actions, environment, lighting, and any important context or changes. Also note any observable emotional cues from people in the frame (facial expression, posture, energy level, apparent mood). Be specific and brief (under 80 words).',
            },
            {
              type: 'image_url',
              image_url: { url: imageUrl, detail: 'low' as const }, // low detail for the summarizer itself to save cost
            },
          ],
        },
      ],
      max_tokens: 250,
      temperature: 0.2,
    });

    return res.choices[0]?.message?.content?.trim() || 'Unable to describe the live frame.';
  } catch (e) {
    return 'Live frame received (summarization failed).';
  }
}
