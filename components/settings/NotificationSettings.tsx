'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Checkbox, TextField } from '@/components/ui/form'
import { Banner } from '@/components/ui/primitives'
import { INTENT_LABEL, INTENTS, type Intent } from '@/lib/domain/intents'
import { apiFetch } from '@/lib/http/client'
import { maskPhone } from '@/lib/notifications/phone'

export type Recipient = {
  userId: string
  displayName: string
  role: string
  isMe: boolean
  autoSmsEnabled: boolean
  categories: Intent[]
  includeOwnEntries: boolean
  quietHoursEnabled: boolean
  quietStart: string
  quietEnd: string
  phoneLast4: string | null
  verified: boolean
  consentAt: string | null
  optedOut: boolean
}

type Mode = 'OFF' | 'COMPOSE' | 'AUTOMATIC'
type Msg = { tone: 'success' | 'danger' | 'info' | 'warning'; text: string } | null

const MODES: { value: Mode; title: string; body: string }[] = [
  {
    value: 'OFF',
    title: 'Off — in-app only',
    body: 'Entries appear in Home and History on every family phone. No texts.',
  },
  {
    value: 'COMPOSE',
    title: 'Draft a text after saving',
    body: 'After each save you get a ready-made update to share or copy into Messages. You pick the recipients and tap Send — the app never sends it for you.',
  },
  {
    value: 'AUTOMATIC',
    title: 'Automatic texts',
    body: 'The site texts each parent who verified their number and agreed to texts, one separate SMS each. Needs a text provider.',
  },
]

function contactStatus(r: Recipient) {
  if (!r.phoneLast4) return 'No number yet'
  if (r.optedOut) return `${maskPhone(r.phoneLast4)} · texts stopped`
  if (!r.verified) return `${maskPhone(r.phoneLast4)} · not verified yet`
  return `${maskPhone(r.phoneLast4)} · verified, ${r.autoSmsEnabled ? 'texts on' : 'texts off'}`
}

export function NotificationSettings({
  mode,
  isOwner,
  canReceive,
  recipients,
  sms,
  consentText,
  consentVersion,
}: {
  mode: Mode
  isOwner: boolean
  canReceive: boolean
  recipients: Recipient[]
  sms: { available: boolean; reason: string | null; canStoreNumbers: boolean }
  consentText: string
  consentVersion: string
}) {
  const router = useRouter()
  const me = recipients.find((r) => r.isMe) ?? null
  const others = recipients.filter((r) => !r.isMe)
  const [msg, setMsg] = useState<Msg>(null)

  const [currentMode, setCurrentMode] = useState(mode)

  async function setMode(next: Mode) {
    const previous = currentMode
    setCurrentMode(next)
    const res = await apiFetch('/api/v1/notifications/mode', {
      method: 'POST',
      body: { mode: next },
    })
    if (!res.ok) setCurrentMode(previous)
    setMsg(
      res.ok
        ? { tone: 'success', text: 'Family texting mode saved. Nothing was sent.' }
        : { tone: 'danger', text: res.message },
    )
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-6">
      {msg ? (
        <Banner tone={msg.tone} role="status">
          {msg.text}
        </Banner>
      ) : null}

      <section className="flex flex-col gap-3" aria-labelledby="mode-title">
        <h2 id="mode-title" className="text-sm font-semibold uppercase tracking-wide text-muted">
          Family texting mode
        </h2>
        <fieldset className="flex flex-col gap-2" disabled={!isOwner}>
          <legend className="sr-only">Family texting mode</legend>
          {MODES.map((m) => {
            const unavailable = m.value === 'AUTOMATIC' && !sms.available
            return (
              <label
                key={m.value}
                className={`flex cursor-pointer gap-3 rounded-2xl border p-3 ${currentMode === m.value ? 'border-primary bg-primary-tint' : 'border-border bg-surface'} ${unavailable ? 'opacity-60' : ''}`}
              >
                <input
                  type="radio"
                  name="mode"
                  className="mt-1 h-5 w-5 accent-[var(--primary)]"
                  checked={currentMode === m.value}
                  disabled={unavailable || !isOwner}
                  onChange={() => setMode(m.value)}
                />
                <span>
                  <span className="block font-semibold">{m.title}</span>
                  <span className="block text-[15px] text-muted">{m.body}</span>
                  {unavailable ? (
                    <span className="mt-1 block text-sm font-semibold">
                      Unavailable: {sms.reason}
                    </span>
                  ) : null}
                </span>
              </label>
            )
          })}
        </fieldset>
        {!isOwner ? (
          <p className="text-sm text-muted">Only the family owner can change the mode.</p>
        ) : null}
      </section>

      {canReceive && me ? (
        <MyTexts
          me={me}
          sms={sms}
          consentText={consentText}
          consentVersion={consentVersion}
          mode={currentMode}
          onMessage={setMsg}
        />
      ) : null}

      {isOwner && others.length ? (
        <section className="flex flex-col gap-3" aria-labelledby="others-title">
          <h2
            id="others-title"
            className="text-sm font-semibold uppercase tracking-wide text-muted"
          >
            Other adults
          </h2>
          {others.map((r) => (
            <OtherAdult key={r.userId} r={r} sms={sms} onMessage={setMsg} />
          ))}
          <p className="text-sm text-muted">
            You can enter a number for someone, but texts start only after they verify it and agree
            on their own phone (Settings → Texts &amp; notifications).
          </p>
        </section>
      ) : null}

      <section
        className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4 text-[15px]"
        aria-labelledby="privacy-title"
      >
        <h2 id="privacy-title" className="font-semibold">
          About texts
        </h2>
        <ul className="list-disc space-y-1 pl-5 text-muted">
          <li>
            Saving an entry never depends on texts. If a text fails, the entry is still saved.
          </li>
          <li>
            Texts say what and when (e.g. “Wet diaper at 2:14 AM (logged by Dad)”) — never the
            baby’s name or notes.
          </li>
          <li>“Sent to provider” is not “delivered”; we show what the carrier reports.</li>
          <li>
            Each parent gets their own text — not a group chat. Fixing an entry later never sends a
            correction text.
          </li>
          <li>
            SMS goes through the mobile carrier and the text provider; it is not end-to-end
            encrypted.
          </li>
        </ul>
      </section>
    </div>
  )
}

function MyTexts({
  me,
  sms,
  consentText,
  consentVersion,
  mode,
  onMessage,
}: {
  me: Recipient
  sms: { available: boolean; reason: string | null; canStoreNumbers: boolean }
  consentText: string
  consentVersion: string
  mode: Mode
  onMessage: (m: Msg) => void
}) {
  const router = useRouter()
  const [phone, setPhone] = useState('')
  const [editingNumber, setEditingNumber] = useState(!me.phoneLast4)
  const [consent, setConsent] = useState(false)
  const [codeSent, setCodeSent] = useState(false)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [prefs, setPrefs] = useState({
    autoSmsEnabled: me.autoSmsEnabled,
    categories: me.categories,
    includeOwnEntries: me.includeOwnEntries,
    quietHoursEnabled: me.quietHoursEnabled,
    quietStart: me.quietStart,
    quietEnd: me.quietEnd,
  })
  const [stopOpen, setStopOpen] = useState(false)

  async function run<T>(
    fn: () => Promise<{ ok: boolean; message?: string; fields?: Record<string, string> } & T>,
    success: string,
  ) {
    setBusy(true)
    const res = await fn()
    setBusy(false)
    if (!res.ok) {
      onMessage({
        tone: 'danger',
        text: Object.values(res.fields ?? {})[0] ?? res.message ?? 'Something went wrong.',
      })
      return false
    }
    onMessage({ tone: 'success', text: success })
    router.refresh()
    return true
  }

  const verified = me.verified && !me.optedOut
  return (
    <section className="flex flex-col gap-3" aria-labelledby="mine-title">
      <h2 id="mine-title" className="text-sm font-semibold uppercase tracking-wide text-muted">
        Texts to me
      </h2>
      <div className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4">
        <p className="font-semibold">{contactStatus(me)}</p>
        {!sms.canStoreNumbers ? (
          <Banner tone="info">
            Automatic texting isn’t set up on this site yet, so numbers can’t be saved. {sms.reason}
          </Banner>
        ) : null}

        {sms.canStoreNumbers && editingNumber ? (
          <form
            className="flex flex-col gap-2"
            noValidate
            onSubmit={async (e) => {
              e.preventDefault()
              const ok = await run(
                () =>
                  apiFetch('/api/v1/notifications/contact', {
                    method: 'POST',
                    body: { phone },
                  }).then((r) =>
                    r.ok ? { ok: true } : { ok: false, message: r.message, fields: r.fields },
                  ),
                'Number saved. Verify it below to turn texts on.',
              )
              if (ok) {
                setPhone('')
                setEditingNumber(false)
                setCodeSent(false)
              }
            }}
          >
            <TextField
              label="My mobile number"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              hint="Stored encrypted. Shown only as the last four digits."
            />
            <Button
              type="submit"
              variant="secondary"
              disabled={busy || phone.replace(/\D/g, '').length < 10}
            >
              Save number
            </Button>
          </form>
        ) : null}
        {sms.canStoreNumbers && me.phoneLast4 && !editingNumber ? (
          <Button variant="ghost" size="md" onClick={() => setEditingNumber(true)}>
            Change number
          </Button>
        ) : null}

        {me.phoneLast4 && !verified && sms.available ? (
          <div className="flex flex-col gap-3 rounded-xl bg-surface-2 p-3">
            <p className="font-semibold">Turn on automatic texts to {maskPhone(me.phoneLast4)}</p>
            <Checkbox
              label="I agree"
              hint={consentText}
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            <Button
              variant="secondary"
              disabled={!consent || busy}
              onClick={async () => {
                const ok = await run(
                  () =>
                    apiFetch('/api/v1/notifications/contact/verify-start', {
                      method: 'POST',
                      body: { consent: true, consentVersion },
                    }).then((r) => (r.ok ? { ok: true } : { ok: false, message: r.message })),
                  'Code sent by text. Enter it below.',
                )
                if (ok) setCodeSent(true)
              }}
            >
              Text me a verification code
            </Button>
            {codeSent ? (
              <form
                className="flex items-end gap-2"
                noValidate
                onSubmit={async (e) => {
                  e.preventDefault()
                  await run(
                    () =>
                      apiFetch('/api/v1/notifications/contact/verify-confirm', {
                        method: 'POST',
                        body: { code },
                      }).then((r) =>
                        r.ok ? { ok: true } : { ok: false, message: r.message, fields: r.fields },
                      ),
                    'Verified. Automatic texts are on for you.',
                  )
                }}
              >
                <div className="flex-1">
                  <TextField
                    label="Code from the text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  />
                </div>
                <Button type="submit" disabled={code.length !== 6 || busy}>
                  Verify
                </Button>
              </form>
            ) : null}
          </div>
        ) : null}

        {verified ? (
          <form
            className="flex flex-col gap-3"
            noValidate
            onSubmit={async (e) => {
              e.preventDefault()
              await run(
                () =>
                  apiFetch('/api/v1/notifications/preferences', {
                    method: 'PATCH',
                    body: prefs,
                  }).then((r) =>
                    r.ok ? { ok: true } : { ok: false, message: r.message, fields: r.fields },
                  ),
                'Text preferences saved.',
              )
            }}
          >
            <Checkbox
              label="Text me automatically"
              checked={prefs.autoSmsEnabled}
              onChange={(e) => setPrefs({ ...prefs, autoSmsEnabled: e.target.checked })}
              hint={
                mode === 'AUTOMATIC' ? undefined : 'Takes effect when the family mode is Automatic.'
              }
            />
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 font-semibold">Text me about</legend>
              {INTENTS.map((i) => (
                <Checkbox
                  key={i}
                  label={INTENT_LABEL[i]}
                  checked={prefs.categories.includes(i)}
                  onChange={(e) =>
                    setPrefs({
                      ...prefs,
                      categories: e.target.checked
                        ? [...prefs.categories, i]
                        : prefs.categories.filter((c) => c !== i),
                    })
                  }
                />
              ))}
            </fieldset>
            <Checkbox
              label="Also text me about entries I log myself"
              checked={prefs.includeOwnEntries}
              onChange={(e) => setPrefs({ ...prefs, includeOwnEntries: e.target.checked })}
            />
            <Checkbox
              label="Quiet hours (no automatic texts to me)"
              checked={prefs.quietHoursEnabled}
              onChange={(e) => setPrefs({ ...prefs, quietHoursEnabled: e.target.checked })}
              hint="Entries logged during quiet hours are not texted later — they’re in History."
            />
            {prefs.quietHoursEnabled ? (
              <div className="grid grid-cols-2 gap-2">
                <TextField
                  label="From"
                  type="time"
                  value={prefs.quietStart}
                  onChange={(e) => setPrefs({ ...prefs, quietStart: e.target.value })}
                />
                <TextField
                  label="Until"
                  type="time"
                  value={prefs.quietEnd}
                  onChange={(e) => setPrefs({ ...prefs, quietEnd: e.target.value })}
                />
              </div>
            ) : null}
            <Button type="submit" variant="secondary" disabled={busy}>
              Save text preferences
            </Button>
            <Button variant="danger" onClick={() => setStopOpen(true)}>
              Stop all texts to me
            </Button>
          </form>
        ) : null}
        {me.optedOut ? (
          <p className="text-sm text-muted">
            Texts are stopped. To restart, verify your number again above.
          </p>
        ) : null}
      </div>
      <ConfirmDialog
        open={stopOpen}
        title="Stop automatic texts to you?"
        confirmLabel="Stop texts"
        busy={busy}
        onCancel={() => setStopOpen(false)}
        onConfirm={async () => {
          await run(
            () =>
              apiFetch('/api/v1/notifications/contact/stop', { method: 'POST', body: {} }).then(
                (r) => (r.ok ? { ok: true } : { ok: false, message: r.message }),
              ),
            'Texts stopped. Nothing more will be sent to you.',
          )
          setStopOpen(false)
        }}
      >
        Takes effect immediately, including texts that haven’t gone out yet. You’ll still see
        everything in the app.
      </ConfirmDialog>
    </section>
  )
}

function OtherAdult({
  r,
  sms,
  onMessage,
}: {
  r: Recipient
  sms: { available: boolean; canStoreNumbers: boolean }
  onMessage: (m: Msg) => void
}) {
  const router = useRouter()
  const [phone, setPhone] = useState('')
  const [open, setOpen] = useState(false)
  const [testOpen, setTestOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4">
      <p className="font-semibold">{r.displayName}</p>
      <p className="text-[15px] text-muted">{contactStatus(r)}</p>
      {sms.canStoreNumbers ? (
        open ? (
          <form
            className="flex flex-col gap-2"
            noValidate
            onSubmit={async (e) => {
              e.preventDefault()
              setBusy(true)
              const res = await apiFetch('/api/v1/notifications/contact', {
                method: 'POST',
                body: { phone, userId: r.userId },
              })
              setBusy(false)
              onMessage(
                res.ok
                  ? {
                      tone: 'success',
                      text: `Saved. ${r.displayName} must verify it on their phone before any text is sent.`,
                    }
                  : { tone: 'danger', text: res.fields?.phone ?? res.message },
              )
              if (res.ok) {
                setOpen(false)
                setPhone('')
                router.refresh()
              }
            }}
          >
            <TextField
              label={`${r.displayName}’s mobile number`}
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <Button type="submit" variant="secondary" size="md" disabled={busy}>
              Save number
            </Button>
          </form>
        ) : (
          <Button variant="ghost" size="md" onClick={() => setOpen(true)}>
            {r.phoneLast4 ? 'Change number' : 'Add number'}
          </Button>
        )
      ) : null}
      {sms.available && r.verified && !r.optedOut ? (
        <Button variant="secondary" size="md" onClick={() => setTestOpen(true)}>
          Send test text…
        </Button>
      ) : null}
      <ConfirmDialog
        open={testOpen}
        title={`Send one test text to ${r.displayName}?`}
        confirmLabel="Send 1 test text"
        confirmVariant="primary"
        busy={busy}
        onCancel={() => setTestOpen(false)}
        onConfirm={async () => {
          setBusy(true)
          const res = await apiFetch<{ state: string }>('/api/v1/notifications/test', {
            method: 'POST',
            body: { userId: r.userId, confirm: true },
          })
          setBusy(false)
          setTestOpen(false)
          onMessage(
            res.ok
              ? {
                  tone: res.data.state === 'SENT_TO_PROVIDER' ? 'success' : 'warning',
                  text:
                    res.data.state === 'SENT_TO_PROVIDER'
                      ? `Test text handed to the provider for ${maskPhone(r.phoneLast4)}. Ask ${r.displayName} whether it arrived.`
                      : 'The provider did not confirm the test text.',
                }
              : { tone: 'danger', text: res.message },
          )
        }}
      >
        Sends exactly one message to {maskPhone(r.phoneLast4)}: “NFC Baby test: automatic texts are
        set up for {r.displayName}.”
      </ConfirmDialog>
    </div>
  )
}
