'use client'

import { useEffect, useState } from 'react'
import { PublicShell } from '@/components/layout/AppShell'
import { useOnline } from '@/components/layout/OfflineBanner'
import { LogScreen } from '@/components/logging/LogScreen'
import { Button } from '@/components/ui/Button'
import { intentFromSlug, type Intent } from '@/lib/domain/intents'
import { isTagToken } from '@/lib/nfc/token'
import { knownTag, latestContext, type OfflineContext } from '@/lib/offline/drafts'
import { PendingDrafts } from './PendingDrafts'

type FormSource = {
  intent: Intent
  userId: string
  householdId: string
  child: { id: string; nickname: string }
  tagToken: string | null
  tagLabel: string | null
  timezone: string
  volumeUnit: 'oz' | 'ml'
  defaultFeedMethod: 'BOTTLE' | 'NURSING' | null
}

type View =
  | { kind: 'loading' }
  | { kind: 'form'; form: FormSource; path: string }
  | { kind: 'generic'; ctx: OfflineContext | null; path: string }

/** Work out what this phone can offer for the address that failed to load. */
async function resolveView(path: string, search: string): Promise<View> {
  const ctx = await latestContext().catch(() => null)
  const tagMatch = /^\/t\/([^/]+)$/.exec(path)
  if (tagMatch && isTagToken(tagMatch[1]!)) {
    const tag = await knownTag(tagMatch[1]!).catch(() => null)
    // Only for the person who last used the app here: never offer someone else's sticker form.
    if (tag && (!ctx || ctx.userId === tag.userId)) {
      return {
        kind: 'form',
        path,
        form: {
          intent: tag.intent,
          userId: tag.userId,
          householdId: tag.householdId,
          child: { id: tag.childId, nickname: tag.childNickname },
          tagToken: tag.token,
          tagLabel: tag.tagLabel,
          timezone: tag.timezone,
          volumeUnit: tag.volumeUnit,
          defaultFeedMethod: tag.defaultFeedMethod,
        },
      }
    }
  }
  const logMatch = /^\/log\/([a-z]+)$/.exec(path)
  const intent = logMatch ? intentFromSlug(logMatch[1]!) : null
  if (intent && ctx?.canLog) {
    const wanted = new URLSearchParams(search).get('child')
    const child = ctx.children.find((c) => c.id === wanted) ?? ctx.children[0]
    if (child) {
      return {
        kind: 'form',
        path: `${path}${search}`,
        form: {
          intent,
          userId: ctx.userId,
          householdId: ctx.householdId,
          child,
          tagToken: null,
          tagLabel: null,
          timezone: ctx.timezone,
          volumeUnit: ctx.volumeUnit,
          defaultFeedMethod: ctx.defaultFeedMethod,
        },
      }
    }
  }
  return { kind: 'generic', ctx, path }
}

export function OfflineScreen() {
  const [view, setView] = useState<View>({ kind: 'loading' })
  const online = useOnline()

  useEffect(() => {
    let cancelled = false
    resolveView(window.location.pathname, window.location.search).then(
      (v) => !cancelled && setView(v),
      () => !cancelled && setView({ kind: 'generic', ctx: null, path: window.location.pathname }),
    )
    return () => {
      cancelled = true
    }
  }, [])

  if (view.kind === 'form') {
    return <LogScreen {...view.form} returnPath={view.path} feedSuggestions={null} offline />
  }

  // /saved/<id> is only opened after the server confirmed the entry.
  const afterSave = view.kind === 'generic' && view.path.startsWith('/saved/')
  return (
    <PublicShell>
      <h1 className="font-display text-2xl font-bold">
        {afterSave ? 'Saved ✓ — details need a connection' : 'You’re offline'}
      </h1>
      <p className="mt-2 text-muted">
        {afterSave
          ? 'The server confirmed your entry before the connection dropped. It is in the shared history; don’t log it again.'
          : 'This page needs a connection. Nothing was recorded from this screen.'}
      </p>
      {view.kind === 'generic' && !view.ctx ? (
        <p className="mt-2 text-muted">
          Tip: open NFC Baby once while online, and stickers you’ve used will still open their form
          without signal.
        </p>
      ) : null}
      <Button variant="primary" block className="mt-6" onClick={() => window.location.reload()}>
        {online ? 'Back online — reload' : 'Try again'}
      </Button>
      {view.kind === 'generic' && view.ctx ? (
        <div className="mt-8">
          <PendingDrafts
            userId={view.ctx.userId}
            householdId={view.ctx.householdId}
            timezone={view.ctx.timezone}
            canSync={false}
          />
        </div>
      ) : null}
    </PublicShell>
  )
}
