'use client';

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Route error:', error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="max-w-md w-full rounded-2xl border border-white/10 bg-zinc-900/60 p-8 text-center">
        <div className="text-3xl font-semibold text-red-400 mb-3">Something went wrong</div>
        <p className="text-zinc-400 mb-6">
          An unexpected error occurred while loading this section.
        </p>
        {error.digest && (
          <div className="mb-6 rounded bg-black/40 p-3 font-mono text-xs text-zinc-500">
            Error ID: {error.digest}
          </div>
        )}
        <button
          onClick={() => reset()}
          className="rounded-lg bg-white px-5 py-2 text-sm font-medium text-black hover:bg-zinc-200 transition"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
