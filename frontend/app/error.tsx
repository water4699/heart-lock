"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Application error:", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-8">
      <div className="rounded-3xl bg-red-50 border border-red-200 p-8 max-w-md w-full text-center">
        <h2 className="text-xl font-semibold text-red-800 mb-4">Something went wrong</h2>
        <p className="text-red-600 mb-6">
          An unexpected error occurred. This might be due to network issues or FHEVM connectivity.
        </p>
        <button
          onClick={reset}
          className="inline-flex items-center justify-center rounded-xl border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 transition-colors"
        >
          Try again
        </button>
      </div>
    </div>
  );
}



