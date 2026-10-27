/**
 * Optional per-phone iPhone Shortcut hand-off (docs/SMS_OPTIONS.md, Option 2). Apple documents the
 * `shortcuts://run-shortcut?name=…&input=text&text=…` URL scheme. The Shortcut must be installed
 * on each phone; the app only opens it and never claims the text was delivered.
 */
export const SHORTCUT_NAME = 'NFC Baby Notify'
export const SHORTCUT_FLAG_KEY = 'nfcb:shortcut-installed'

export function shortcutRunUrl(text: string): string {
  return `shortcuts://run-shortcut?name=${encodeURIComponent(SHORTCUT_NAME)}&input=text&text=${encodeURIComponent(text)}`
}
