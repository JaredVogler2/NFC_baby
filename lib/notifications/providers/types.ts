export type SendOutcome =
  /** The provider accepted the message (queued). This is NOT delivery. */
  | { kind: 'accepted'; messageId: string; status: string }
  /** The provider definitely did not accept it. */
  | { kind: 'rejected'; code: string; retryable: boolean; optedOut?: boolean }
  /** We cannot tell whether the provider accepted it (timeout / dropped connection after sending). */
  | { kind: 'unknown'; code: string }

export interface SmsProvider {
  readonly name: 'off' | 'mock' | 'twilio'
  readonly configured: boolean
  send(input: { to: string; body: string; statusCallbackUrl?: string | null }): Promise<SendOutcome>
}
