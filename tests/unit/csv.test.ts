import { describe, expect, it } from 'vitest'
import { escapeCsvCell, toCsv } from '@/lib/export/csv'

describe('CSV export safety', () => {
  it.each([
    ['=SUM(A1:A2)', "'=SUM(A1:A2)"],
    ['+1 555 0100', "'+1 555 0100"],
    ['-2+3', "'-2+3"],
    ['@cmd', "'@cmd"],
    ['\tTAB', "'\tTAB"],
    ['=HYPERLINK("http://x","click")', `"'=HYPERLINK(""http://x"",""click"")"`],
  ])('neutralises formula-looking text %j', (input, expected) => {
    expect(escapeCsvCell(input)).toBe(expected)
  })

  it('quotes commas, quotes and newlines; leaves numbers alone', () => {
    expect(escapeCsvCell('leak, at side')).toBe('"leak, at side"')
    expect(escapeCsvCell('said "hi"')).toBe('"said ""hi"""')
    expect(escapeCsvCell('line1\nline2')).toBe('"line1\nline2"')
    expect(escapeCsvCell(103.5074)).toBe('103.5074')
    expect(escapeCsvCell(-1)).toBe('-1')
    expect(escapeCsvCell(null)).toBe('')
    expect(escapeCsvCell(Number.NaN)).toBe('')
  })

  it('writes a BOM, header row and CRLF rows', () => {
    const csv = toCsv(
      [{ a: 'x', b: 1 }],
      [
        { header: 'a', value: (r) => r.a },
        { header: 'b', value: (r) => r.b },
      ],
    )
    expect(csv).toBe('﻿a,b\r\nx,1\r\n')
  })
})
