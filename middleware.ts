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
 * Generates the branded 500 Supabase error page HTML.
 * Matches the design in 500-supabase-error.html exactly.
 */
function get500Html(code: string, message: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>500 Internal Server Error</title>
  <style>
    body {
      margin: 0;
      height: 100vh;
      background: #0f172a;
      color: #e2e8f0;
      font-family: system-ui, -apple-system, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .error-box {
      background: #1e2937;
      border: 1px solid #334155;
      border-radius: 12px;
      padding: 40px 50px;
      max-width: 520px;
      text-align: center;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
    }
    .error-code {
      font-size: 28px;
      font-weight: 700;
      color: #f87171;
      margin-bottom: 16px;
    }
    .message {
      font-size: 17px;
      margin-bottom: 12px;
    }
    .subtext {
      color: #94a3b8;
      font-size: 15px;
      margin-bottom: 24px;
    }
    .id-box {
      background: #0f172a;
      padding: 12px 16px;
      border-radius: 8px;
      font-family: monospace;
      font-size: 14px;
      color: #cbd5e1;
      margin: 20px 0;
    }
    .footer {
      margin-top: 30px;
      color: #64748b;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <div class="error-box">
    <div class="error-code">500: INTERNAL_SERVER_ERROR</div>
    <div class="message">
      Code: <strong>${code}</strong>
    </div>
    <div class="subtext">
      ${message}
    </div>
    <div class="id-box">
      ID: ${Date.now()}-${Math.random().toString(36).substring(2, 15)}
    </div>
    <div class="footer">
      Orchestrator — Personal AI Command Center
    </div>
  </div>
</body>
</html>`;
}