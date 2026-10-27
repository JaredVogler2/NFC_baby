'use client'

import { useEffect, useRef, useState } from 'react'
import { Banner } from '@/components/ui/primitives'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/form'
import { apiFetch } from '@/lib/http/client'

type Step = 'email' | 'code'

export function LoginForm({ next, initialEmail = '' }: { next: string; initialEmail?: string }) {
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState(initialEmail)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cooldown, setCooldown] = useState(0)
  const codeRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  useEffect(() => {
    if (step === 'code') codeRef.current?.focus()
  }, [step])

  async function sendCode(event?: React.FormEvent) {
    event?.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    const result = await apiFetch<{ ok: true }>('/api/v1/auth/otp', {
      method: 'POST',
      body: { email: email.trim(), next },
    })
    setBusy(false)
    if (!result.ok) {
      setError(
        result.code === 'RATE_LIMITED'
          ? 'Too many codes requested. Wait a minute, then try again.'
          : result.kind === 'http'
            ? (result.fields?.email ?? result.message)
            : 'Could not reach the server. Check your connection.',
      )
      return
    }
    setStep('code')
    setCooldown(30)
  }

  async function verify(event: React.FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    const result = await apiFetch<{ next: string }>('/api/v1/auth/verify', {
      method: 'POST',
      body: { email: email.trim(), code: code.replace(/\s/g, ''), next },
    })
    if (!result.ok) {
      setBusy(false)
      setError(
        result.kind === 'http'
          ? 'That code is not valid or has expired. Check the newest email or request a new code.'
          : 'Could not reach the server. Check your connection.',
      )
      return
    }
    // Full navigation so the new session cookie is used by every server render.
    window.location.assign(result.data.next)
  }

  if (step === 'email') {
    return (
      <form onSubmit={sendCode} className="flex flex-col gap-4" noValidate>
        <TextField
          label="Email"
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          autoCapitalize="none"
          spellCheck={false}
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={error ?? undefined}
        />
        <Button type="submit" size="xl" block disabled={busy || !email.includes('@')}>
          {busy ? 'Sending…' : 'Email me a sign-in code'}
        </Button>
        <p className="text-sm text-muted">
          We&apos;ll email a link and a 6-digit code. Only invited family members can sign in.
        </p>
      </form>
    )
  }

  return (
    <form onSubmit={verify} className="flex flex-col gap-4" noValidate>
      <Banner tone="info" title="Check your email" role="status">
        If <strong>{email}</strong> belongs to a family member, a sign-in link and code are on the
        way. On a home-screen app, type the code here.
      </Banner>
      <TextField
        ref={codeRef}
        label="Code"
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={10}
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ''))}
        error={error ?? undefined}
        className="text-center text-2xl tracking-[0.4em] tabular"
      />
      <Button type="submit" size="xl" block disabled={busy || code.length < 6}>
        {busy ? 'Signing in…' : 'Sign in'}
      </Button>
      <div className="flex items-center justify-between text-[15px]">
        <button
          type="button"
          className="min-h-11 font-semibold text-muted underline-offset-4 hover:underline"
          onClick={() => {
            setStep('email')
            setCode('')
            setError(null)
          }}
        >
          Use a different email
        </button>
        <button
          type="button"
          className="min-h-11 font-semibold text-muted underline-offset-4 hover:underline disabled:no-underline disabled:opacity-60"
          disabled={cooldown > 0 || busy}
          onClick={() => sendCode()}
        >
          {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
        </button>
      </div>
    </form>
  )
}
