#!/usr/bin/env node
// Renders the app icon SVG to the PNG sizes iOS/Android need, using Playwright's Chromium.
// Run: node scripts/generate-icons.mjs  (outputs into public/icons/, committed)
import { chromium } from '@playwright/test'
import { writeFileSync } from 'node:fs'

const mark = (pad) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#1d5c63"/>
  <g transform="translate(${pad} ${pad}) scale(${(512 - 2 * pad) / 512})">
    <g transform="translate(28 0)">
      <path d="M176 200a88 88 0 0 1 0 112M232 160a152 152 0 0 1 0 192M288 120a216 216 0 0 1 0 272"
        fill="none" stroke="#ffffff" stroke-width="34" stroke-linecap="round"/>
      <circle cx="128" cy="256" r="26" fill="#ffffff"/>
    </g>
  </g>
</svg>`

const targets = [
  ['icon-192.png', 192, 40],
  ['icon-512.png', 512, 40],
  ['maskable-512.png', 512, 110],
  ['apple-touch-icon.png', 180, 40],
  ['favicon-32.png', 32, 30],
]

const browser = await chromium.launch()
const page = await browser.newPage()
for (const [name, size, pad] of targets) {
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(
    `<html><body style="margin:0">${mark(pad).replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`,
  )
  writeFileSync(`public/icons/${name}`, await page.screenshot({ omitBackground: false }))
  console.log('wrote', name)
}
writeFileSync('public/icons/icon.svg', mark(40).trim() + '\n')
await browser.close()
