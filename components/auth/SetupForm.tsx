'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { SelectField, TextField } from '@/components/ui/form'
import { Banner } from '@/components/ui/primitives'
import { apiFetch } from '@/lib/http/client'

export function SetupForm({ timezones }: { timezones: string[] }) {
  const [form, setForm] = useState({
    householdName: '',
    childNickname: '',
    displayName: '',
    timezone: 'America/New_York',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set =
    (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }))

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setErrors({})
    setMessage(null)
    const result = await apiFetch<{ next: string }>('/api/v1/setup', { method: 'POST', body: form })
    if (!result.ok) {
      setBusy(false)
      setErrors(result.fields ?? {})
      setMessage(result.message)
      return
    }
    window.location.assign(result.data.next)
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      {message ? (
        <Banner tone="danger" role="alert">
          {message}
        </Banner>
      ) : null}
      <TextField
        label="Your name (as the family sees it)"
        hint="For example “Mom”. Shown next to entries you log."
        value={form.displayName}
        onChange={set('displayName')}
        error={errors.displayName}
        maxLength={40}
        autoComplete="nickname"
      />
      <TextField
        label="Baby’s nickname"
        hint="Only family members ever see this. A nickname is fine."
        value={form.childNickname}
        onChange={set('childNickname')}
        error={errors.childNickname}
        maxLength={40}
        autoComplete="off"
      />
      <TextField
        label="Family name"
        hint="For example “The Smiths”."
        value={form.householdName}
        onChange={set('householdName')}
        error={errors.householdName}
        maxLength={60}
        autoComplete="off"
      />
      <SelectField
        label="Time zone"
        value={form.timezone}
        onChange={set('timezone')}
        error={errors.timezone}
      >
        {timezones.map((tz) => (
          <option key={tz} value={tz}>
            {tz.replace(/_/g, ' ')}
          </option>
        ))}
      </SelectField>
      <Button type="submit" size="xl" block disabled={busy}>
        {busy ? 'Creating…' : 'Create our family log'}
      </Button>
    </form>
  )
}
