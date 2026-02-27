'use client'

import { useEffect } from 'react'

// Global error boundary catches errors in the root layout
// This is a special file that must include its own html and body tags
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[Global Error]', error)
  }, [error])

  return (
    <html lang="en">
      <body className="bg-gray-950">
        <div className="min-h-screen flex items-center justify-center px-4">
          <div className="max-w-md w-full text-center">
            <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg
                className="w-10 h-10 text-red-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>

            <h1 className="text-3xl font-bold text-white mb-3">
              Application Error
            </h1>

            <p className="text-gray-400 mb-6 text-lg">
              A critical error occurred. Please refresh the page to continue.
            </p>

            {error.digest && (
              <p className="text-xs text-gray-500 mb-6">
                Error ID: {error.digest}
              </p>
            )}

            <div className="flex gap-4 justify-center">
              <button
                onClick={reset}
                className="px-8 py-3 bg-[#CEB466] hover:bg-[#e0c97d] text-[#171229] font-semibold rounded-lg transition-colors text-lg"
              >
                Try again
              </button>

              <button
                onClick={() => window.location.href = '/'}
                className="px-8 py-3 bg-gray-800 hover:bg-gray-700 text-white font-semibold rounded-lg transition-colors text-lg"
              >
                Go Home
              </button>
            </div>
          </div>
        </div>
      </body>
    </html>
  )
}
