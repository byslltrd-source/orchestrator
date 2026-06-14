import { createBrowserClient } from '@supabase/ssr'

export type SupabaseClient = ReturnType<typeof createBrowserClient>

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. Supabase is required for Orchestrator.')
  }

  return createBrowserClient(url, key)
}
