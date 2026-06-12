import { NextResponse } from 'next/server';

// For testing the custom 500 error page during development.
// Visit /api/test-500 in the browser (while on HTTPS) to trigger a server error.
export async function GET() {
  // This will cause an unhandled error that should be caught by global-error.tsx
  // or result in a 500.
  throw new Error('Intentional test error for 500 page (MIDDLEWARE_INVOCATION_FAILED simulation)');
}
