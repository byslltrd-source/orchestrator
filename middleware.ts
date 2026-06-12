import { type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

const requiredEnv = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
];

export async function middleware(request: NextRequest) {
  // Fail fast with a clear message if critical env vars are missing.
  // This prevents cryptic ERR_EMPTY_RESPONSE in the browser.
  const missing = requiredEnv.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.error(
      `\n[Orchestrator] Missing required environment variables: ${missing.join(', ')}\n` +
      `Copy .env.example to .env.local and fill in the values, then restart the dev server.\n`
    );
    return new Response(
      'Server misconfigured: missing Supabase environment variables. Check the terminal for details.',
      { status: 500, headers: { 'Content-Type': 'text/plain' } }
    );
  }

  // Also treat placeholders as invalid (return error page so user sees clear message).
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  if (url.includes('your-project') || anon.includes('your-anon') || !url || !anon) {
    console.error(
      '\n[Orchestrator] Supabase environment variables are missing or still set to placeholder values.\n' +
      'Please edit .env.local with your actual Supabase Project URL and anon public key (from Supabase Dashboard → Settings → API).\n' +
      'Then fully restart the dev server.\n'
    );
    return new Response(
      'Server misconfigured: missing or placeholder Supabase environment variables. Check the terminal for details and set up .env.local.',
      { status: 500, headers: { 'Content-Type': 'text/plain' } }
    );
  }

  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};