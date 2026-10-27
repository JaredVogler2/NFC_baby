import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * WCAG contrast checks on the actual CSS tokens, for both the day and night themes.
 * Text pairs need ≥ 4.5:1 (AA); UI component boundaries and focus rings need ≥ 3:1.
 */
const css = readFileSync(path.join(process.cwd(), 'app/globals.css'), 'utf8')

function block(selector: string): Record<string, string> {
  const start = css.indexOf(selector)
  if (start < 0) throw new Error(`selector not found: ${selector}`)
  const open = css.indexOf('{', start)
  const close = css.indexOf('}', open)
  const vars: Record<string, string> = {}
  for (const m of css.slice(open + 1, close).matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6})/gi)) {
    vars[m[1]!] = m[2]!
  }
  return vars
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi! + 0.05) / (lo! + 0.05)
}

const themes = {
  day: block(':root {'),
  night: block(":root[data-theme='dark'] {"),
}

const TEXT_PAIRS: [string, string][] = [
  ['text', 'bg'],
  ['text', 'surface'],
  ['text', 'surface-2'],
  ['text-muted', 'bg'],
  ['text-muted', 'surface'],
  ['text-muted', 'surface-2'],
  ['primary-fg', 'primary'],
  ['danger-fg', 'danger'],
  ['danger-ink', 'surface'],
  ['danger-ink', 'bg'],
  ['success', 'surface'],
  ['warning', 'surface'],
  ['text', 'primary-tint'],
  ['text', 'success-tint'],
  ['text', 'warning-tint'],
  ['text', 'danger-tint'],
  ['text-muted', 'primary-tint'],
  ['text-muted', 'warning-tint'],
  ['text-muted', 'danger-tint'],
  ['text-muted', 'success-tint'],
  ...(['wet', 'poop', 'both', 'feed'] as const).flatMap((k): [string, string][] => [
    [`${k}-fg`, k],
    [`${k}-ink`, `${k}-tint`],
    [`${k}-ink`, 'surface'],
    ['text', `${k}-tint`],
  ]),
]

const UI_PAIRS: [string, string][] = [
  ['border-strong', 'surface'],
  ['border-strong', 'bg'],
  ['focus', 'bg'],
  ['focus', 'surface'],
]

describe.each(Object.entries(themes))('%s theme contrast', (_name, vars) => {
  it.each(TEXT_PAIRS)('%s on %s ≥ 4.5:1', (fg, bg) => {
    expect(vars[fg], fg).toBeDefined()
    expect(vars[bg], bg).toBeDefined()
    expect(contrast(vars[fg]!, vars[bg]!)).toBeGreaterThanOrEqual(4.5)
  })
  it.each(UI_PAIRS)('%s on %s ≥ 3:1', (fg, bg) => {
    expect(contrast(vars[fg]!, vars[bg]!)).toBeGreaterThanOrEqual(3)
  })
})

it('system-dark block matches the explicit night theme', () => {
  const systemDark = block(":root:not([data-theme='light']) {")
  expect(systemDark).toEqual(themes.night)
})
