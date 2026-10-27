/**
 * CSV writer with spreadsheet formula-injection protection: any text cell that begins with
 * = + - @ (or tab / carriage return) is prefixed with a single quote so Excel, Numbers and Sheets
 * treat it as text, never as a formula. Numbers are written as numbers.
 */
const DANGEROUS_START = /^[=+\-@\t\r]/

export function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : ''
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  let text = String(value)
  if (DANGEROUS_START.test(text)) text = `'${text}`
  if (/[",\r\n]/.test(text)) text = `"${text.replace(/"/g, '""')}"`
  return text
}

export function toCsv<T>(
  rows: T[],
  columns: { header: string; value: (row: T) => unknown }[],
): string {
  const lines = [columns.map((c) => escapeCsvCell(c.header)).join(',')]
  for (const row of rows) lines.push(columns.map((c) => escapeCsvCell(c.value(row))).join(','))
  // CRLF per RFC 4180; BOM so Excel opens UTF-8 names/notes correctly.
  return `﻿${lines.join('\r\n')}\r\n`
}
