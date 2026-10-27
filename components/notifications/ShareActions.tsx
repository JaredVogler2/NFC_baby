'use client'

import { useEffect, useState } from 'react'
import { CopyIcon, MessageIcon, ShareIcon } from '@/components/icons'
import { Button } from '@/components/ui/Button'
import { SHORTCUT_FLAG_KEY, SHORTCUT_NAME, shortcutRunUrl } from '@/lib/notifications/shortcut'

/**
 * Manual sharing of the update text. The web page cannot send a text by itself: the parent picks
 * recipients and taps Send in Messages. We never record or display this as "sent".
 */
export function ShareActions({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const [canShare, setCanShare] = useState(false)
  const [hasShortcut, setHasShortcut] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- feature detection after mount
    setCanShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function')
    try {
      setHasShortcut(localStorage.getItem(SHORTCUT_FLAG_KEY) === '1')
    } catch {
      setHasShortcut(false)
    }
  }, [])

  async function share() {
    setNote(null)
    try {
      await navigator.share({ text })
      setNote(
        'Share sheet closed. If you chose Messages and tapped Send, it went from your phone — the app can’t confirm delivery.',
      )
    } catch {
      // User canceled the share sheet: nothing happened.
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      setNote('Copy failed — press and hold the text above to copy it.')
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <p
        className="select-all rounded-xl border border-border bg-surface-2 px-3 py-2 text-[15px]"
        aria-label="Update text"
      >
        {text}
      </p>
      {hasShortcut ? (
        <a
          href={shortcutRunUrl(text)}
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary px-5 font-semibold text-primary-fg"
          onClick={() =>
            setNote(
              `Opened your “${SHORTCUT_NAME}” Shortcut. It runs on this phone; the app can’t confirm it sent.`,
            )
          }
        >
          Run “{SHORTCUT_NAME}”
        </a>
      ) : null}
      {canShare ? (
        <Button
          variant={hasShortcut ? 'secondary' : 'primary'}
          block
          icon={<ShareIcon size={20} />}
          onClick={share}
        >
          Share update with Mom &amp; Dad
        </Button>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" icon={<CopyIcon size={20} />} onClick={copy}>
          {copied ? 'Copied' : 'Copy text'}
        </Button>
        <a
          href="sms:"
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-border-strong bg-surface px-4 font-semibold"
        >
          <MessageIcon size={20} /> Open Messages
        </a>
      </div>
      <p className="text-sm text-muted">
        Choose both parents as recipients in Messages. {note ?? ''}
      </p>
    </div>
  )
}
