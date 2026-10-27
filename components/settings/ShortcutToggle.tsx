'use client'

import { useEffect, useState } from 'react'
import { Checkbox } from '@/components/ui/form'
import { SHORTCUT_FLAG_KEY, SHORTCUT_NAME } from '@/lib/notifications/shortcut'

/** Per-phone flag: this iPhone has the "NFC Baby Notify" Shortcut installed (docs/SMS_OPTIONS.md). */
export function ShortcutToggle() {
  const [on, setOn] = useState(false)
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read device-local flag after mount
      setOn(localStorage.getItem(SHORTCUT_FLAG_KEY) === '1')
    } catch {
      setOn(false)
    }
  }, [])
  return (
    <Checkbox
      label={`I installed the “${SHORTCUT_NAME}” Shortcut on this iPhone`}
      hint="Adds a “Run Shortcut” button after saving, which hands the update text to your Shortcut. Set it up once per phone; the app can’t confirm what the Shortcut sends."
      checked={on}
      onChange={(e) => {
        setOn(e.target.checked)
        try {
          if (e.target.checked) localStorage.setItem(SHORTCUT_FLAG_KEY, '1')
          else localStorage.removeItem(SHORTCUT_FLAG_KEY)
        } catch {
          // storage unavailable
        }
      }}
    />
  )
}
