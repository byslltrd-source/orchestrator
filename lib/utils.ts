import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export interface UserProfile {
  subscription_plan?: string | null;
  subscription_status?: string | null;
  orchestrations_used?: number | null;
  orchestrations_limit?: number | null;
  usage_reset_date?: string | null;
  stripe_customer_id?: string | null;
  email?: string | null;
  // Real-time Vision (expensive, opt-in premium feature)
  realtime_vision_consent?: boolean | null;
  realtime_vision_frames_used?: number | null;
}

export function isProUser(profile: UserProfile | null | undefined): boolean {
  if (!profile) return false;
  return (
    profile.subscription_plan === "pro" &&
    (profile.subscription_status === "active" || profile.subscription_status === "trialing")
  );
}

/** Top-tier subscribers get Real-time Vision (live camera feed to the agent). */
export function isPremiumUser(profile: UserProfile | null | undefined): boolean {
  if (!profile) return false;
  return (
    profile.subscription_plan === "premium" &&
    (profile.subscription_status === "active" || profile.subscription_status === "trialing")
  );
}

// Simple required env validation. Call early in server routes / agent entrypoints.
// Does not throw on optional keys.
// NOTE: OPENAI_API_KEY is still listed for compatibility (embeddings + default model),
// but the orchestrator now supports many AIs. See lib/ai/models.ts + ORCHESTRATOR_* / provider-specific keys.
const REQUIRED_SERVER = [
  'OPENAI_API_KEY',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'STORAGE_BUCKET', // for the enhanced storage layer
] as const;

export function validateEnv(required: readonly string[] = REQUIRED_SERVER) {
  const missing: string[] = [];
  for (const key of required) {
    if (!process.env[key]) missing.push(key);
  }
  if (missing.length > 0) {
    const msg = `Missing required environment variables: ${missing.join(', ')}`;
    if (typeof window === 'undefined') {
      console.error(msg);
    }
    return { ok: false, missing, message: msg };
  }
  return { ok: true, missing: [], message: '' };
}
