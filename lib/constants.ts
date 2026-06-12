// Shared constants for the Orchestrator app.
// Central place for limits, plans, models, etc. Update here + re-run schema defaults if changing free tier.

export const FREE_LIMIT = 20;
export const PRO_LIMIT = 999_999; // effectively unlimited

export const DEFAULT_MODEL = 'gpt-4o-mini';
export const EMBEDDING_MODEL = 'text-embedding-3-small';

export const MAX_TASK_LENGTH = 4000;
export const MAX_AUTONOMOUS_STEPS = 15;
export const MAX_STEPS_DEFAULT = 12;

export const MAX_IMAGES_FREE = 1;
export const MAX_IMAGES_PRO = 6; // client cap
export const MAX_IMAGE_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB total for a request

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
