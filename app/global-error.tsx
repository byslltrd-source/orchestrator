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
          fontFamily: 'system-ui, -apple-system, sans-serif',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#e2e8f0',
        }}
      >
        <div
          style={{
            background: '#1e2937',
            border: '1px solid #334155',
            borderRadius: 12,
            padding: '40px 50px',
            maxWidth: 520,
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.3)',
            textAlign: 'left',
          }}
        >
          <div
            style={{
              fontSize: 28,
              fontWeight: 700,
              color: '#f87171',
              marginBottom: 12,
            }}
          >
            500: INTERNAL_SERVER_ERROR
          </div>
          <div
            style={{
              fontSize: 17,
              color: '#cbd5e1',
              marginBottom: 20,
            }}
          >
            Something went wrong on our end.
          </div>
          <div
            style={{
              background: '#0f172a',
              padding: 14,
              borderRadius: 8,
              fontFamily: 'ui-monospace, monospace',
              fontSize: 14,
              color: '#64748b',
              marginTop: 20,
              wordBreak: 'break-all',
            }}
          >
            {error.digest ? `Digest: ${error.digest}` : error.message || 'Unknown error'}
          </div>
          <div style={{ marginTop: 28, textAlign: 'center' }}>
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
              fontSize: 13,
              color: '#64748b',
              marginTop: 24,
              textAlign: 'center',
            }}
          >
            Orchestrator — Personal AI Command Center
          </div>
        </div>
      </body>
    </html>
  );
}
