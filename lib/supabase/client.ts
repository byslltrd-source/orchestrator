import { createBrowserClient } from '@supabase/ssr'

export type SupabaseClient = ReturnType<typeof createBrowserClient>

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // Return a safe stub during build / server prerender (no keys or server render of client comps).
  // Real functionality only matters in the browser at runtime.
  if (!url || !key) {
    if (typeof window === 'undefined') {
      return {
        auth: {
          getUser: async () => ({ data: { user: null }, error: null }),
          onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
          signUp: async () => ({ error: null }),
          signInWithPassword: async () => ({ error: null }),
          signOut: async () => ({ error: null }),
        },
        from() {
          // Build-time / no-env stub. Real client used at runtime in browser.
          const chain: Record<string, unknown> = {
            select: () => chain,
            insert: () => chain,
            update: () => chain,
            eq: () => chain,
            order: () => chain,
            limit: () => chain,
            single: async () => ({ data: null, error: null }),
          };
          return {
            ...chain,
            then: (resolve: (v: unknown) => void) => Promise.resolve({ data: [], error: null }).then(resolve),
          };
        },
        channel: () => ({
          on: () => ({ subscribe: () => {} }),
          subscribe: () => {},
          unsubscribe: () => {},
        }),
        removeChannel() {},
        rpc: async () => ({ data: null, error: null }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any
    }
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY')
  }

  return createBrowserClient(url, key)
}
