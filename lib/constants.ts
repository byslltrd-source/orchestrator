// Shared constants for the Orchestrator app.
// Central place for limits, plans, models, etc. Update here + re-run schema defaults if changing free tier.

export const FREE_LIMIT = 20;
export const PRO_LIMIT = 999_999; // effectively unlimited

export const DEFAULT_MODEL = 'gpt-4o-mini';
export const EMBEDDING_MODEL = 'text-embedding-3-small';

// Re-export for convenience so existing imports keep working
export { DEFAULT_ORCHESTRATOR_MODEL_ID } from './ai/models';

export const MAX_TASK_LENGTH = 4000;
export const MAX_AUTONOMOUS_STEPS = 15;
export const MAX_STEPS_DEFAULT = 12;

export const MAX_IMAGES_FREE = 1;
export const MAX_IMAGES_PRO = 6; // client cap
export const MAX_IMAGE_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB total for a request

// Real-time Vision (Premium top-tier only)
export const REALTIME_VISION_ENABLED = true;
export const REALTIME_VISION_MIN_INTERVAL_MS = 4000; // don't allow spamming frames (cost control)
export const REALTIME_VISION_MAX_FRAMES_PER_RUN = 60; // generous but bounded for a long autonomous run

// Cheap model for summarizing live frames before (or alongside) injecting the full image to the main agent model.
// This helps control costs for the "real time vision" feature while still providing the raw image when needed.
export const VISION_SUMMARIZER_MODEL = 'gpt-4o-mini';

// Physical World Integration (Premium + Real-time Vision opt-in only)
// Allows the agent to not only SEE the physical world (via live camera) but also ACT on it (sensors + actuators).
// This is deliberately high-risk and expensive (real-world consequences, potential hardware costs, safety issues).
// Customers must explicitly opt in. All physical actions are logged and can be dry-run.
export const PHYSICAL_INTEGRATION_ENABLED = true;
export const PHYSICAL_DEFAULT_CONTROLLER_URL = process.env.PHYSICAL_CONTROLLER_URL || ''; // e.g. https://your-home-assistant.local/api or your custom webhook
export const PHYSICAL_ACTION_TIMEOUT_MS = 15000; // max time to wait for physical response
export const PHYSICAL_MAX_ACTIONS_PER_RUN = 20; // safety cap per autonomous run

// Smart Home focus for Physical World Integration
// The bridge between digital (calendar, weather, AI reasoning, web data) and physical (lights, locks, climate, security, robots, sensors).
// Primary killer app: Smart Home (Home Assistant, Matter, Zigbee, etc.)
// "ALL" covers broader physical: robots, printers, industrial IoT, cars, etc.
export const SMART_HOME_DOMAINS = ['light', 'switch', 'climate', 'lock', 'cover', 'fan', 'media_player', 'scene', 'automation', 'sensor', 'binary_sensor', 'alarm_control_panel'];

export const PLANS = {
  FREE: 'free',
  PRO: 'pro',
} as const;

export const SUBSCRIPTION_STATUSES = {
  FREE: 'free',
  ACTIVE: 'active',
  TRIALING: 'trialing',
  CANCELED: 'canceled',
} as const;

export type Plan = (typeof PLANS)[keyof typeof PLANS];
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[keyof typeof SUBSCRIPTION_STATUSES];

/**
 * SINGLE-OWNER MODE (for commercial sale / company purchaser deployments)
 *
 * This artifact is intended to be purchased by a company and integrated into their
 * environment as they see fit (internal tool, white-labeled for their customers,
 * embedded in products, etc.). There is intentionally NO public sign-up or login flow.
 *
 * All data (memories, agent_runs, agent_steps, stored files, profiles, usage) is
 * partitioned under a single fixed "owner" user ID.
 *
 * - Set OWNER_USER_ID in your .env.local to a real Supabase auth user UUID if you
 *   want to keep RLS policies strict and use normal authenticated client queries.
 * - Or leave as the default string 'orchestrator-owner' and either:
 *     a) Disable RLS on the relevant tables for your private deployment, or
 *     b) Add simple owner policies, e.g.:
 *        CREATE POLICY "single_owner_read" ON agent_runs FOR SELECT
 *        USING (user_id = 'orchestrator-owner');
 *   (Same for memories, agent_steps, profiles, etc.)
 *
 * Writes from the API routes use the service role client + this ID, so inserts
 * always succeed with the correct user_id even without an auth user row.
 *
 * The frontend runs fully unlocked (all features: realtime vision, physical,
 * emotional/Life OS, OMNIS, proprietary orchestra_tool + engines, unlimited storage,
 * all models). The purchaser can add their own auth layer (SSO, multi-tenancy,
 * per-customer billing, etc.) later.
 */
export const OWNER_USER_ID =
  process.env.OWNER_USER_ID ||
  process.env.NEXT_PUBLIC_OWNER_USER_ID ||
  'orchestrator-owner';
