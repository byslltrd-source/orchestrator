// Multiple AI support for the Orchestrator agent.
// Curated presets for the main reasoning model (tool calling + vision where applicable).
// Most use the OpenAI-compatible chat completions format so the existing tool loop works.
//
// Add your own by extending this map or using the "custom" entry + env vars.

export type OrchestratorModelId = keyof typeof ORCHESTRATOR_MODELS;

export interface OrchestratorModelDef {
  label: string;
  model: string;                 // The model identifier sent to the provider
  baseURL?: string;              // Omit for default OpenAI endpoint
  apiKeyEnv?: string;            // Which env var holds the key (falls back to ORCHESTRATOR_API_KEY / OPENAI_API_KEY)
  notes?: string;
  supportsVision?: boolean;
  speed?: 'fast' | 'medium' | 'slow';
  cost?: 'low' | 'medium' | 'high';
}

export const ORCHESTRATOR_MODELS = {
  default: {
    label: 'Default (GPT-4o-mini)',
    model: 'gpt-4o-mini',
    notes: 'Fast, cheap, solid all-rounder with vision',
    supportsVision: true,
    speed: 'fast',
    cost: 'low',
  },

  'gpt-4o': {
    label: 'GPT-4o',
    model: 'gpt-4o',
    notes: 'Strong reasoning + excellent vision',
    supportsVision: true,
    speed: 'medium',
    cost: 'medium',
  },

  grok: {
    label: 'Grok (xAI)',
    model: 'grok-2-latest',
    baseURL: 'https://api.x.ai/v1',
    apiKeyEnv: 'XAI_API_KEY',
    notes: 'Great at coding & tool use. Set XAI_API_KEY in env.',
    supportsVision: false, // update when vision model is primary
    speed: 'medium',
    cost: 'medium',
  },

  'grok-build': {
    label: 'Grok Build (xAI coding)',
    model: 'grok-build',
    baseURL: 'https://api.x.ai/v1',
    apiKeyEnv: 'XAI_API_KEY',
    notes: 'xAI specialized coding model (if available in your access)',
    supportsVision: false,
    speed: 'medium',
    cost: 'medium',
  },

  'claude-sonnet': {
    label: 'Claude 3.5 Sonnet (via OpenRouter)',
    model: 'anthropic/claude-3.5-sonnet',
    baseURL: 'https://openrouter.ai/api/v1',
    apiKeyEnv: 'OPENROUTER_API_KEY',
    notes: 'Excellent reasoning & long context. Requires OPENROUTER_API_KEY.',
    supportsVision: true,
    speed: 'medium',
    cost: 'medium',
  },

  'claude-opus': {
    label: 'Claude 3 Opus (via OpenRouter)',
    model: 'anthropic/claude-3-opus',
    baseURL: 'https://openrouter.ai/api/v1',
    apiKeyEnv: 'OPENROUTER_API_KEY',
    notes: 'Top-tier careful reasoning (slower/more expensive).',
    supportsVision: true,
    speed: 'slow',
    cost: 'high',
  },

  groq: {
    label: 'Groq Llama 3.1 70B',
    model: 'llama-3.1-70b-versatile',
    baseURL: 'https://api.groq.com/openai/v1',
    apiKeyEnv: 'GROQ_API_KEY',
    notes: 'Very fast inference. Great for rapid agent loops.',
    supportsVision: false,
    speed: 'fast',
    cost: 'low',
  },

  'groq-mixtral': {
    label: 'Groq Mixtral 8x7B',
    model: 'mixtral-8x7b-32768',
    baseURL: 'https://api.groq.com/openai/v1',
    apiKeyEnv: 'GROQ_API_KEY',
    notes: 'Fast & capable open model on Groq.',
    supportsVision: false,
    speed: 'fast',
    cost: 'low',
  },

  ollama: {
    label: 'Ollama (local)',
    model: 'llama3.1',
    baseURL: 'http://localhost:11434/v1',
    notes: 'Run any local model (ollama pull first). Zero cost after setup. Vision depends on the model.',
    supportsVision: false, // set true for llava / bakllava etc.
    speed: 'medium',
    cost: 'low',
  },

  openrouter: {
    label: 'OpenRouter (pick any)',
    model: 'openai/gpt-4o-mini', // change the model value in env or override
    baseURL: 'https://openrouter.ai/api/v1',
    apiKeyEnv: 'OPENROUTER_API_KEY',
    notes: 'Huge catalog (Claude, Gemini, Grok, Llama, etc.). Set desired model via ORCHESTRATOR_MODEL or pick a preset.',
    supportsVision: true,
    speed: 'medium',
    cost: 'medium',
  },

  custom: {
    label: 'Custom (env-configured)',
    model: 'custom', // placeholder; runtime resolver will replace with ORCHESTRATOR_MODEL / OPENAI_MODEL / DEFAULT
    baseURL: undefined,
    apiKeyEnv: 'ORCHESTRATOR_API_KEY',
    notes: 'Uses ORCHESTRATOR_MODEL + ORCHESTRATOR_BASE_URL + ORCHESTRATOR_API_KEY (or OPENAI fallback).',
    supportsVision: true,
  },
} as const satisfies Record<string, OrchestratorModelDef>;

// Helper for UI dropdowns
export function getModelOptions() {
  return Object.entries(ORCHESTRATOR_MODELS).map(([id, def]) => {
    const d = def as any;
    return {
      id: id as OrchestratorModelId,
      label: d.label,
      notes: d.notes,
      supportsVision: d.supportsVision ?? false,
      speed: d.speed as 'fast' | 'medium' | 'slow' | undefined,
      cost: d.cost as 'low' | 'medium' | 'high' | undefined,
    };
  });
}

// Default id used when nothing selected
export const DEFAULT_ORCHESTRATOR_MODEL_ID: OrchestratorModelId = 'default';
