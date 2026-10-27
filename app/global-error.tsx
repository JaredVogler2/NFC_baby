'use client'

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', padding: 24, background: '#f7f4ef' }}>
        <h1>Something went wrong</h1>
        <p>Nothing was saved unless you saw &ldquo;Saved&rdquo;.</p>
        <button type="button" onClick={reset} style={{ minHeight: 44, padding: '0 16px' }}>
          Try again
        </button>
      </body>
    </html>
  )
}
