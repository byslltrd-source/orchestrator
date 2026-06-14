import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

let cachedClient: ReturnType<typeof createSupabaseClient<Database>> | null = null

// Use this only on the server for admin operations (webhooks, usage increments, memory, agent runs, etc.)
// Never expose the service role key to the browser.
export function createServiceClient() {
  if (cachedClient) return cachedClient

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY (or NEXT_PUBLIC_SUPABASE_URL). Supabase is required for all tools and agent execution.")
  }

  cachedClient = createSupabaseClient<Database>(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
  return cachedClient
}

// Typed version for places that want full type inference on .from()
export type TypedServiceClient = ReturnType<typeof createServiceClient>
