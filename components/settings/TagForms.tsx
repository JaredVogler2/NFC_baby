'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { KIND } from '@/components/logging/kind'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Segmented, SelectField, TextField } from '@/components/ui/form'
import { Banner } from '@/components/ui/primitives'
import { INTENTS, type Intent } from '@/lib/domain/intents'
import { apiFetch } from '@/lib/http/client'

const DEFAULT_LABEL: Record<Intent, string> = {
  WET: 'Changing table — wet',
  POOP: 'Changing table — poop',
  BOTH: 'Changing table — both',
  FEED: 'Bottle station — feed',
}

const PURPOSE_OPTIONS = INTENTS.map((intent) => {
  const k = KIND[intent]
  return {
    value: intent,
    label: intent === 'BOTH' ? 'Both' : k.label.split(' ')[0]!,
    icon: <k.Icon size={20} />,
  }
})

type Child = { id: string; nickname: string }

export function TagCreateForm({ childOptions }: { childOptions: Child[] }) {
  const router = useRouter()
  const [purpose, setPurpose] = useState<Intent>('WET')
  const [childId, setChildId] = useState(childOptions[0]?.id ?? '')
  const [label, setLabel] = useState(DEFAULT_LABEL.WET)
  const [labelTouched, setLabelTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)

  async function create(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setErrors({})
    setMessage(null)
    const res = await apiFetch<{ tag: { id: string } }>('/api/v1/tags', {
      method: 'POST',
      body: { purpose, childId, label },
    })
    setBusy(false)
    if (!res.ok) {
      setErrors(res.fields ?? {})
      setMessage(res.message)
      return
    }
    router.push(`/settings/tags/${res.data.tag.id}?created=1`)
  }

  return (
    <form onSubmit={create} className="flex flex-col gap-4" noValidate>
      {message ? (
        <Banner tone="danger" role="alert">
          {message}
        </Banner>
      ) : null}
      <Segmented
        legend="What does this sticker log?"
        name="purpose"
        value={purpose}
        options={PURPOSE_OPTIONS}
        columns={2}
        onChange={(v) => {
          setPurpose(v)
          if (!labelTouched) setLabel(DEFAULT_LABEL[v])
        }}
      />
      {childOptions.length > 1 ? (
        <SelectField
          label="Child"
          value={childId}
          onChange={(e) => setChildId(e.target.value)}
          error={errors.childId}
        >
          {childOptions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nickname}
            </option>
          ))}
        </SelectField>
      ) : null}
      <TextField
        label="Label (where it is)"
        hint="Printed on the label and shown when scanned. Don’t include anything private."
        value={label}
        maxLength={60}
        onChange={(e) => {
          setLabel(e.target.value)
          setLabelTouched(true)
        }}
        error={errors.label}
      />
      <Button type="submit" block disabled={busy || !label.trim()}>
        {busy ? 'Creating…' : 'Create sticker link'}
      </Button>
      <p className="text-sm text-muted">
        Creating a sticker only registers its link. It never logs an entry.
      </p>
    </form>
  )
}

export function TagEditForm({
  tag,
  childOptions,
}: {
  tag: { id: string; purpose: Intent; label: string; childId: string }
  childOptions: Child[]
}) {
  const router = useRouter()
  const [purpose, setPurpose] = useState<Intent>(tag.purpose)
  const [childId, setChildId] = useState(tag.childId)
  const [label, setLabel] = useState(tag.label)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)
  const changedPurpose = purpose !== tag.purpose || childId !== tag.childId

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setStatus(null)
    const res = await apiFetch(`/api/v1/tags/${tag.id}`, {
      method: 'PATCH',
      body: { purpose, childId, label },
    })
    setBusy(false)
    if (!res.ok) {
      setStatus({ tone: 'danger', text: res.fields?.label ?? res.message })
      return
    }
    setStatus({ tone: 'success', text: 'Saved. The sticker URL did not change.' })
    router.refresh()
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-4" noValidate>
      <Segmented
        legend="Logs"
        name="edit-purpose"
        value={purpose}
        options={PURPOSE_OPTIONS}
        columns={2}
        onChange={setPurpose}
      />
      {childOptions.length > 1 ? (
        <SelectField label="Child" value={childId} onChange={(e) => setChildId(e.target.value)}>
          {childOptions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nickname}
            </option>
          ))}
        </SelectField>
      ) : null}
      <TextField
        label="Label"
        value={label}
        maxLength={60}
        onChange={(e) => setLabel(e.target.value)}
      />
      {changedPurpose ? (
        <Banner tone="warning">
          Changing what this sticker logs takes effect immediately for everyone. Re-label the
          physical sticker and test it again.
        </Banner>
      ) : null}
      {status ? (
        <Banner tone={status.tone} role="status">
          {status.text}
        </Banner>
      ) : null}
      <Button type="submit" variant="secondary" block disabled={busy || !label.trim()}>
        {busy ? 'Saving…' : 'Save changes'}
      </Button>
    </form>
  )
}

export function RevokeTagButton({ tagId }: { tagId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <>
      <Button variant="danger" block onClick={() => setOpen(true)}>
        Retire this sticker
      </Button>
      {error ? (
        <p role="alert" className="text-sm font-semibold text-danger-ink">
          {error}
        </p>
      ) : null}
      <ConfirmDialog
        open={open}
        title="Retire this sticker?"
        confirmLabel="Retire sticker"
        busy={busy}
        onCancel={() => setOpen(false)}
        onConfirm={async () => {
          setBusy(true)
          const res = await apiFetch(`/api/v1/tags/${tagId}/revoke`, { method: 'POST', body: {} })
          setBusy(false)
          setOpen(false)
          if (!res.ok) {
            setError(res.message)
            return
          }
          router.refresh()
        }}
      >
        Its link stops working permanently (it can&apos;t be turned back on). Past entries stay. To
        replace it, create a new sticker and write the new link.
      </ConfirmDialog>
    </>
  )
}

export function CopyField({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[15px] font-semibold">{label}</span>
      <div className="flex items-stretch gap-2">
        <input
          readOnly
          value={value}
          aria-label={label}
          onFocus={(e) => e.currentTarget.select()}
          className="min-h-12 min-w-0 flex-1 rounded-xl border border-border-strong bg-surface-2 px-3 font-mono text-sm"
        />
        <Button
          variant="secondary"
          size="md"
          className="min-h-12"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value)
              setCopied(true)
              setTimeout(() => setCopied(false), 2000)
            } catch {
              // fall back to manual selection
            }
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
    </div>
  )
}
