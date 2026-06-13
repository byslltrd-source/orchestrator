'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error('Global error caught:', error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          height: '100vh',
          background: '#0f172a',
          color: '#e2e8f0',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            background: '#1e2937',
            border: '1px solid #334155',
            borderRadius: 12,
            padding: '40px 50px',
            maxWidth: 520,
            textAlign: 'center',
            boxShadow: '0 10px 30px rgba(0, 0, 0, 0.4)',
          }}
        >
          <div
            style={{
              fontSize: 28,
              fontWeight: 700,
              color: '#f87171',
              marginBottom: 16,
            }}
          >
            500: INTERNAL_SERVER_ERROR
          </div>
          <div
            style={{
              fontSize: 17,
              marginBottom: 12,
            }}
          >
            Code: <strong>RUNTIME_ERROR</strong>
          </div>
          <div
            style={{
              color: '#94a3b8',
              fontSize: 15,
              marginBottom: 24,
            }}
          >
            {error.message || 'An unexpected error occurred. See terminal for details.'}
          </div>
          {error.digest && (
            <div
              style={{
                background: '#0f172a',
                padding: '12px 16px',
                borderRadius: 8,
                fontFamily: 'monospace',
                fontSize: 14,
                color: '#cbd5e1',
                margin: '20px 0',
              }}
            >
              ID: {error.digest}
            </div>
          )}
          <div style={{ marginTop: 30 }}>
            <button
              onClick={() => reset()}
              style={{
                background: '#3b82f6',
                color: 'white',
                border: 'none',
                padding: '10px 20px',
                borderRadius: 8,
                fontSize: 14,
                cursor: 'pointer',
                fontWeight: 500,
              }}
            >
              Try again
            </button>
          </div>
          <div
            style={{
              marginTop: 30,
              color: '#64748b',
              fontSize: 14,
            }}
          >
            Orchestrator — Personal AI Command Center
          </div>
        </div>
      </body>
    </html>
  );
}
