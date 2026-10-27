'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { CopyField } from '@/components/settings/TagForms'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { SelectField, TextField } from '@/components/ui/form'
import { Banner } from '@/components/ui/primitives'
import { ROLE_LABEL, ROLES, type Role } from '@/lib/domain/intents'
import { apiFetch } from '@/lib/http/client'

const ROLE_HELP: Record<Role, string> = {
  owner: 'Everything, including members, texting and family settings',
  parent: 'Log, edit any entry, manage stickers, export',
  caregiver: 'Log and edit their own entries; no phone numbers, members or export',
  viewer: 'Read-only',
}

type Member = { userId: string; displayName: string; role: Role; disabled: boolean }
type Invite = {
  id: string
  email: string
  role: Role
  expiresAt: string
  status: 'pending' | 'expired'
}

export function MembersManager({
  members,
  invites,
  meId,
}: {
  members: Member[]
  invites: Invite[]
  meId: string
}) {
  const router = useRouter()
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)
  const [confirm, setConfirm] = useState<{
    title: string
    body: string
    run: () => Promise<void>
  } | null>(null)
  const [busy, setBusy] = useState(false)

  async function patch(userId: string, body: { role?: Role; disabled?: boolean }) {
    const res = await apiFetch(`/api/v1/members/${userId}`, { method: 'PATCH', body })
    setMessage(res.ok ? { tone: 'success', text: 'Saved.' } : { tone: 'danger', text: res.message })
    if (res.ok) router.refresh()
  }

  return (
    <div className="flex flex-col gap-3">
      {message ? (
        <Banner tone={message.tone} role="status">
          {message.text}
        </Banner>
      ) : null}
      <ul className="flex flex-col gap-2">
        {members.map((m) => (
          <li
            key={m.userId}
            className={`flex flex-col gap-2 rounded-xl border border-border p-3 ${m.disabled ? 'opacity-70' : ''}`}
          >
            <p className="font-semibold">
              {m.displayName}
              {m.userId === meId ? <span className="font-normal text-muted"> (you)</span> : null}
              {m.disabled ? <span className="font-normal text-muted"> · deactivated</span> : null}
            </p>
            {m.userId === meId ? (
              <p className="text-sm text-muted">
                {ROLE_LABEL[m.role]} — {ROLE_HELP[m.role]}
              </p>
            ) : (
              <>
                <SelectField
                  label={`Role for ${m.displayName}`}
                  value={m.role}
                  hint={ROLE_HELP[m.role]}
                  onChange={(e) => {
                    const role = e.target.value as Role
                    setConfirm({
                      title: `Make ${m.displayName} ${ROLE_LABEL[role].toLowerCase()}?`,
                      body: ROLE_HELP[role],
                      run: () => patch(m.userId, { role }),
                    })
                  }}
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABEL[r]}
                    </option>
                  ))}
                </SelectField>
                <Button
                  size="md"
                  variant={m.disabled ? 'secondary' : 'ghost'}
                  onClick={() =>
                    setConfirm({
                      title: m.disabled
                        ? `Reactivate ${m.displayName}?`
                        : `Deactivate ${m.displayName}?`,
                      body: m.disabled
                        ? 'They can sign in and use the family log again.'
                        : 'They immediately lose access to the family log and stop receiving automatic texts. Their past entries stay.',
                      run: () => patch(m.userId, { disabled: !m.disabled }),
                    })
                  }
                >
                  {m.disabled ? 'Reactivate' : 'Deactivate'}
                </Button>
              </>
            )}
          </li>
        ))}
      </ul>

      <InviteForm onCreated={() => router.refresh()} />

      {invites.length ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">Invites</h3>
          {invites.map((i) => (
            <div
              key={i.id}
              className="flex items-center justify-between gap-2 rounded-xl border border-border p-3"
            >
              <div className="min-w-0">
                <p className="truncate font-semibold">{i.email}</p>
                <p className="text-sm text-muted">
                  {ROLE_LABEL[i.role]} ·{' '}
                  {i.status === 'expired' ? 'expired' : 'waiting to be accepted'}
                </p>
              </div>
              {i.status === 'pending' ? (
                <Button
                  size="md"
                  variant="ghost"
                  onClick={() =>
                    setConfirm({
                      title: 'Cancel this invite?',
                      body: 'The link stops working immediately.',
                      run: async () => {
                        const res = await apiFetch(`/api/v1/invites/${i.id}/revoke`, {
                          method: 'POST',
                          body: {},
                        })
                        setMessage(
                          res.ok
                            ? { tone: 'success', text: 'Invite canceled.' }
                            : { tone: 'danger', text: res.message },
                        )
                        router.refresh()
                      },
                    })
                  }
                >
                  Cancel
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      <ConfirmDialog
        open={confirm !== null}
        title={confirm?.title ?? ''}
        confirmLabel="Confirm"
        confirmVariant="primary"
        busy={busy}
        onCancel={() => {
          setConfirm(null)
          router.refresh()
        }}
        onConfirm={async () => {
          setBusy(true)
          await confirm?.run()
          setBusy(false)
          setConfirm(null)
        }}
      >
        {confirm?.body}
      </ConfirmDialog>
    </div>
  )
}

function InviteForm({ onCreated }: { onCreated: () => void }) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('parent')
  const [displayName, setDisplayName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [link, setLink] = useState<string | null>(null)

  return (
    <form
      className="flex flex-col gap-3 rounded-xl border border-border bg-surface-2 p-3"
      noValidate
      onSubmit={async (e) => {
        e.preventDefault()
        setBusy(true)
        setError(null)
        setLink(null)
        const res = await apiFetch<{ url: string }>('/api/v1/invites', {
          method: 'POST',
          body: { email, role, displayName: displayName || undefined },
        })
        setBusy(false)
        if (!res.ok) {
          setError(res.fields?.email ?? res.message)
          return
        }
        setLink(res.data.url)
        setEmail('')
        setDisplayName('')
        onCreated()
      }}
    >
      <h3 className="font-semibold">Invite someone</h3>
      <TextField
        label="Their email"
        type="email"
        autoComplete="off"
        inputMode="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <TextField
        label="Their name (optional)"
        hint="For example “Dad”. They can change it."
        value={displayName}
        maxLength={40}
        onChange={(e) => setDisplayName(e.target.value)}
      />
      <SelectField
        label="Role"
        value={role}
        hint={ROLE_HELP[role]}
        onChange={(e) => setRole(e.target.value as Role)}
      >
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {ROLE_LABEL[r]}
          </option>
        ))}
      </SelectField>
      {error ? (
        <p role="alert" className="text-sm font-semibold text-danger-ink">
          {error}
        </p>
      ) : null}
      <Button type="submit" block disabled={busy || !email.includes('@')}>
        {busy ? 'Creating…' : 'Create invite link'}
      </Button>
      {link ? (
        <div className="flex flex-col gap-2" role="status">
          <CopyField label="Invite link — send it privately" value={link} />
          <p className="text-sm text-muted">
            Works once, for that email address only, for 72 hours. Opening it never adds anyone
            until they sign in with that email and tap Join.
          </p>
        </div>
      ) : null}
    </form>
  )
}
