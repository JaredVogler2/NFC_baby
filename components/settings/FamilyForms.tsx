'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Segmented, SelectField, TextField } from '@/components/ui/form'
import { Banner } from '@/components/ui/primitives'
import { apiFetch } from '@/lib/http/client'

type Status = { tone: 'success' | 'danger'; text: string } | null

export function FamilyForm({
  initial,
  timezones,
  canEdit,
}: {
  initial: {
    displayName: string
    timezone: string
    defaultFeedMethod: 'BOTTLE' | 'NURSING' | null
    defaultVolumeUnit: 'oz' | 'ml'
  }
  timezones: string[]
  canEdit: boolean
}) {
  const router = useRouter()
  const [form, setForm] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<Status>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setStatus(null)
    const res = await apiFetch('/api/v1/household', { method: 'PATCH', body: form })
    setBusy(false)
    if (!res.ok) {
      setErrors(res.fields ?? {})
      setStatus({ tone: 'danger', text: res.message })
      return
    }
    setErrors({})
    setStatus({ tone: 'success', text: 'Saved.' })
    router.refresh()
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-4" noValidate>
      <fieldset disabled={!canEdit} className="flex flex-col gap-4">
        <TextField
          label="Family name"
          value={form.displayName}
          maxLength={60}
          error={errors.displayName}
          onChange={(e) => setForm({ ...form, displayName: e.target.value })}
        />
        <SelectField
          label="Time zone"
          hint="All times are shown and entered in this zone, on every phone."
          value={form.timezone}
          error={errors.timezone}
          onChange={(e) => setForm({ ...form, timezone: e.target.value })}
        >
          {timezones.map((tz) => (
            <option key={tz} value={tz}>
              {tz.replace(/_/g, ' ')}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Feeding method to preselect"
          hint="Used only when there’s no previous feeding to suggest from. Always visible before saving."
          value={form.defaultFeedMethod ?? ''}
          onChange={(e) =>
            setForm({
              ...form,
              defaultFeedMethod: (e.target.value || null) as 'BOTTLE' | 'NURSING' | null,
            })
          }
        >
          <option value="">None — ask every time</option>
          <option value="BOTTLE">Bottle</option>
          <option value="NURSING">Nursing</option>
        </SelectField>
        <Segmented
          legend="Bottle volume unit (family default)"
          name="family-unit"
          value={form.defaultVolumeUnit}
          size="md"
          options={[
            { value: 'oz', label: 'oz' },
            { value: 'ml', label: 'mL' },
          ]}
          onChange={(defaultVolumeUnit) => setForm({ ...form, defaultVolumeUnit })}
        />
      </fieldset>
      {status ? (
        <Banner tone={status.tone} role="status">
          {status.text}
        </Banner>
      ) : null}
      {canEdit ? (
        <Button type="submit" block disabled={busy}>
          {busy ? 'Saving…' : 'Save family settings'}
        </Button>
      ) : (
        <p className="text-sm text-muted">Only the family owner can change these.</p>
      )}
    </form>
  )
}

export function ChildrenManager({
  items,
  canEdit,
}: {
  items: { id: string; nickname: string; archived: boolean }[]
  canEdit: boolean
}) {
  const router = useRouter()
  const [names, setNames] = useState(() => Object.fromEntries(items.map((c) => [c.id, c.nickname])))
  const [newName, setNewName] = useState('')
  const [status, setStatus] = useState<Status>(null)
  const [busy, setBusy] = useState<string | null>(null)

  async function call(id: string | null, body: { nickname: string; archived?: boolean }) {
    setBusy(id ?? 'new')
    setStatus(null)
    const res = id
      ? await apiFetch(`/api/v1/children/${id}`, {
          method: 'PATCH',
          body: { archived: false, ...body },
        })
      : await apiFetch('/api/v1/children', { method: 'POST', body })
    setBusy(null)
    if (!res.ok) {
      setStatus({
        tone: 'danger',
        text: res.fields?.nickname ?? res.fields?.archived ?? res.message,
      })
      return false
    }
    setStatus({ tone: 'success', text: 'Saved.' })
    router.refresh()
    return true
  }

  return (
    <div className="flex flex-col gap-3">
      {items.map((c) => (
        <div key={c.id} className="flex flex-col gap-2 rounded-xl border border-border p-3">
          <TextField
            label={c.archived ? 'Nickname (archived)' : 'Nickname'}
            value={names[c.id] ?? ''}
            maxLength={40}
            disabled={!canEdit}
            onChange={(e) => setNames({ ...names, [c.id]: e.target.value })}
          />
          {canEdit ? (
            <div className="grid grid-cols-2 gap-2">
              <Button
                size="md"
                variant="secondary"
                disabled={busy === c.id}
                onClick={() =>
                  call(c.id, { nickname: names[c.id] ?? c.nickname, archived: c.archived })
                }
              >
                Save name
              </Button>
              <Button
                size="md"
                variant="ghost"
                disabled={busy === c.id}
                onClick={() => call(c.id, { nickname: c.nickname, archived: !c.archived })}
              >
                {c.archived ? 'Unarchive' : 'Archive'}
              </Button>
            </div>
          ) : null}
        </div>
      ))}
      {canEdit ? (
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <TextField
              label="Add a child (nickname)"
              value={newName}
              maxLength={40}
              onChange={(e) => setNewName(e.target.value)}
            />
          </div>
          <Button
            size="lg"
            disabled={!newName.trim() || busy === 'new'}
            onClick={async () => {
              if (await call(null, { nickname: newName })) setNewName('')
            }}
          >
            Add
          </Button>
        </div>
      ) : null}
      {status ? (
        <Banner tone={status.tone} role="status">
          {status.text}
        </Banner>
      ) : null}
    </div>
  )
}

export function ProfileForm({ initial }: { initial: string }) {
  const router = useRouter()
  const [name, setName] = useState(initial)
  const [status, setStatus] = useState<Status>(null)
  return (
    <form
      className="flex flex-col gap-3"
      noValidate
      onSubmit={async (e) => {
        e.preventDefault()
        const res = await apiFetch('/api/v1/me/profile', {
          method: 'PATCH',
          body: { displayName: name },
        })
        setStatus(
          res.ok
            ? { tone: 'success', text: 'Saved.' }
            : { tone: 'danger', text: res.fields?.displayName ?? res.message },
        )
        if (res.ok) router.refresh()
      }}
    >
      <TextField
        label="Your name (shown on entries)"
        value={name}
        maxLength={40}
        onChange={(e) => setName(e.target.value)}
      />
      {status ? (
        <Banner tone={status.tone} role="status">
          {status.text}
        </Banner>
      ) : null}
      <Button type="submit" variant="secondary" block>
        Save name
      </Button>
    </form>
  )
}
