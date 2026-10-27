import '@testing-library/jest-dom/vitest'
// In-memory IndexedDB for offline-draft tests (jsdom has none).
import 'fake-indexeddb/auto'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

// `server-only` throws when imported outside a React Server environment; unit tests import
// server modules directly, so stub it.
vi.mock('server-only', () => ({}))

process.env.NFC_BABY_SILENT_LOGS = '1'

afterEach(() => {
  cleanup()
})
