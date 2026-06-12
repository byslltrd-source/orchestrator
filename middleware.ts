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
    return new Response(get500Html('MIDDLEWARE_INVOCATION_FAILED', 'Missing required Supabase environment variables. See terminal for setup instructions.'), {
      status: 500,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
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
    return new Response(get500Html('MIDDLEWARE_INVOCATION_FAILED', 'Supabase environment variables are missing or set to placeholder values. Check terminal and .env.local.'), {
      status: 500,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
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

/**
 * Generates the branded 500 error page HTML.
 * Matches the design in 500-error.html, adapted for dynamic messages.
 */
function get500Html(code: string, message: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>500 Internal Server Error | Orchestrator</title>
  <style>
    body {
      margin: 0;
      height: 100vh;
      background: #0f172a;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #e2e8f0;
    }
    .error-box {
      background: #1e2937;
      border: 1px solid #334155;
      border-radius: 12px;
      padding: 40px 50px;
      max-width: 520px;
      box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.3);
      text-align: left;
    }
    .error-code {
      font-size: 28px;
      font-weight: 700;
      color: #f87171;
      margin-bottom: 12px;
    }
    .message {
      font-size: 17px;
      color: #cbd5e1;
      margin-bottom: 20px;
    }
    .details {
      background: #0f172a;
      padding: 14px;
      border-radius: 8px;
      font-family: ui-monospace, monospace;
      font-size: 14px;
      color: #64748b;
      margin-top: 20px;
      word-break: break-all;
    }
    .brand {
      font-size: 13px;
      color: #64748b;
      margin-top: 24px;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="error-box">
    <div class="error-code">500: INTERNAL_SERVER_ERROR</div>
    <div class="message">
      Code: <strong>${code}</strong>
    </div>
    <div class="message" style="font-size: 15px; margin-top: -8px; color: #94a3b8;">
      ${message}
    </div>
    <div class="details">
      ID: ${Date.now()}-${Math.random().toString(36).substring(2, 15)}
    </div>
    <div class="brand">Orchestrator — Personal AI Command Center</div>
  </div>
</body>
</html>`;
}