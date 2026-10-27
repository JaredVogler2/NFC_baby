import { appendFileSync, mkdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { dirname } from 'node:path'
import type { SendOutcome, SmsProvider } from './types'

/**
 * Test-only provider. Never sends anything. Refuses to run on Vercel. Behaviour is selected by
 * fictional 555-01xx numbers:  …0199 → permanent failure, …0198 → unknown (timeout after send),
 * …0197 → retryable (rate limited), …0196 → opted out (STOP), anything else → accepted.
 * Each send is appended to MOCK_SMS_LOG_FILE (if set) so tests can assert on bodies.
 */
export function mockProvider(): SmsProvider {
  const allowed = process.env.VERCEL !== '1'
  return {
    name: 'mock',
    configured: allowed,
    async send({ to, body }): Promise<SendOutcome> {
      if (!allowed)
        return { kind: 'rejected', code: 'MOCK_DISABLED_IN_DEPLOYMENT', retryable: false }
      let outcome: SendOutcome
      if (to.endsWith('0199')) outcome = { kind: 'rejected', code: '21211', retryable: false }
      else if (to.endsWith('0198')) outcome = { kind: 'unknown', code: 'TIMEOUT' }
      else if (to.endsWith('0197')) outcome = { kind: 'rejected', code: '429', retryable: true }
      else if (to.endsWith('0196'))
        outcome = { kind: 'rejected', code: '21610', retryable: false, optedOut: true }
      else
        outcome = {
          kind: 'accepted',
          messageId: `SMmock${randomUUID().replace(/-/g, '')}`,
          status: 'queued',
        }
      const file = process.env.MOCK_SMS_LOG_FILE
      if (file) {
        // A fresh checkout (CI) has no test-results/ yet; the log must never break a send.
        mkdirSync(dirname(file), { recursive: true })
        appendFileSync(
          file,
          `${JSON.stringify({ at: new Date().toISOString(), toLast4: to.slice(-4), body, outcome: outcome.kind, messageId: outcome.kind === 'accepted' ? outcome.messageId : null })}\n`,
        )
      }
      return outcome
    },
  }
}
