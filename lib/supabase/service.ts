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
    if (process.env.BYPASS_SUPABASE_CHECK === 'true' || process.env.NEXT_PUBLIC_BYPASS_SUPABASE_CHECK === 'true') {
      // Stub for test mode - memory/storage calls will no-op or return empty
      return {
        from: () => ({
          insert: async () => ({ error: null }),
          select: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: [], error: null }) }) }) }),
          update: async () => ({ error: null }),
          delete: async () => ({ error: null }),
        }),
        storage: {
          from: () => ({
            upload: async () => ({ error: null }),
            remove: async () => ({ error: null }),
            list: async () => ({ data: [], error: null }),
            getPublicUrl: () => ({ data: { publicUrl: 'https://example.com/mock' } }),
            createSignedUrl: async () => ({ data: { signedUrl: 'https://example.com/mock-signed' }, error: null }),
          }),
        },
        rpc: async () => ({ data: null, error: null }),
      } as any
    }
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY (or NEXT_PUBLIC_SUPABASE_URL)")
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
