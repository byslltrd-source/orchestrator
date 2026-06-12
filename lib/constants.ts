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
