/** Exact wording the adult agrees to before verification. Bump the version when it changes. */
export const CONSENT_TEXT_VERSION = '2026-10-v1'

export const CONSENT_TEXT =
  'I agree to receive automatic text messages at this number about baby-care entries my family logs in NFC Baby ' +
  '(up to about 20 per hour). Message and data rates may apply. Reply STOP to opt out or HELP for help. ' +
  'Texts travel through my mobile carrier and a text-message provider and are not end-to-end encrypted.'

export const VERIFICATION_SMS = (code: string) =>
  `NFC Baby: your verification code is ${code}. It confirms you agreed to automatic baby-care texts. Reply STOP to opt out.`

export const TEST_SMS = (name: string) =>
  `NFC Baby test: automatic texts are set up for ${name}. No action needed. Reply STOP to opt out.`

export const STOP_WORDS = new Set([
  'STOP',
  'STOPALL',
  'UNSUBSCRIBE',
  'CANCEL',
  'END',
  'QUIT',
  'OPTOUT',
  'REVOKE',
])

/** Carrier-standard re-subscribe keywords: the number may verify again (texts stay off until then). */
export const START_WORDS = new Set(['START', 'UNSTOP', 'YES'])
