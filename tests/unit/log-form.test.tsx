import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LogForm } from '@/components/logging/LogForm'

const replace = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn() }),
}))

const props = {
  intent: 'WET' as const,
  userId: 'user-1',
  child: { id: '11111111-1111-4111-8111-111111111111', nickname: 'Bean' },
  tagToken: '0123456789abcdefghjkmnpqrs',
  tagLabel: 'Changing table',
  timezone: 'America/New_York',
  volumeUnit: 'oz' as const,
  returnPath: '/t/0123456789abcdefghjkmnpqrs',
}

const EVENT_ID = '22222222-2222-4222-8222-222222222222'

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('LogForm save behaviour', () => {
  beforeEach(() => {
    sessionStorage.clear()
    replace.mockReset()
  })
  afterEach(() => vi.unstubAllGlobals())

  it('shows the intent, child and a single explicit Save; nothing is sent on render', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    render(<LogForm {...props} />)
    expect(screen.getByRole('heading', { name: 'Log wet diaper' })).toBeInTheDocument()
    expect(screen.getByText('Bean')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save wet diaper' })).toBeEnabled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('a double tap sends exactly one request with one stable clientRequestId', async () => {
    let resolveFetch: (r: Response) => void = () => {}
    const fetchMock = vi.fn(() => new Promise<Response>((r) => (resolveFetch = r)))
    vi.stubGlobal('fetch', fetchMock)
    render(<LogForm {...props} />)
    const button = screen.getByRole('button', { name: 'Save wet diaper' })
    const user = userEvent.setup()
    await user.click(button)
    await user.click(button)
    await user.click(button)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled()
    const body = JSON.parse(
      (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string,
    )
    expect(body).toMatchObject({ intent: 'WET', tagToken: props.tagToken })
    expect(body.occurredAt).toBeUndefined() // "Now" is decided by the server at Save
    await act(async () => resolveFetch(jsonResponse(201, { event: { id: EVENT_ID } })))
    expect(replace).toHaveBeenCalledWith(`/saved/${EVENT_ID}`)
  })

  it('after a lost response it asks the server with the same key instead of creating a new entry', async () => {
    const calls: string[] = []
    let key = ''
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? 'GET'} ${url}`)
      if (init?.method === 'POST') {
        key = JSON.parse(init.body as string).clientRequestId
        throw new TypeError('Failed to fetch') // response lost
      }
      return jsonResponse(200, { event: { id: EVENT_ID } })
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<LogForm {...props} />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Save wet diaper' }))
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith(`/saved/${EVENT_ID}`))
    expect(calls).toEqual(['POST /api/v1/events', `GET /api/v1/events/by-request/${key}`])
  })

  it('a confirmed "not saved" keeps the key for a safe retry', async () => {
    const keys: string[] = []
    let postCount = 0
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        keys.push(JSON.parse(init.body as string).clientRequestId)
        postCount++
        if (postCount === 1) throw new TypeError('Failed to fetch')
        return jsonResponse(201, { event: { id: EVENT_ID } })
      }
      return jsonResponse(404, { error: { code: 'NOT_FOUND', message: 'x' } })
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<LogForm {...props} />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Save wet diaper' }))
    await screen.findByText(/Not saved — check your connection/)
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    await vi.waitFor(() => expect(replace).toHaveBeenCalled())
    expect(keys).toHaveLength(2)
    expect(keys[0]).toBe(keys[1])
  })

  it('an expired session keeps the entry and offers sign-in back to this screen', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(401, { error: { code: 'UNAUTHENTICATED', message: 'x' } })),
    )
    render(<LogForm {...props} />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Save wet diaper' }))
    const link = await screen.findByRole('link', { name: 'Sign in' })
    expect(link).toHaveAttribute('href', `/login?next=${encodeURIComponent(props.returnPath)}`)
    expect(sessionStorage.getItem(`nfcb:attempt:user-1:tag:${props.tagToken}`)).toContain(
      '"sent":true',
    )
  })

  it('validation from the server is shown and nothing claims success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(422, {
          error: {
            code: 'VALIDATION',
            message: 'That time is more than a day ago. Confirm to save it.',
            details: { confirmOld: true },
          },
        }),
      ),
    )
    render(<LogForm {...props} />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Save wet diaper' }))
    expect(await screen.findByText('That’s more than a day ago')).toBeInTheDocument()
    expect(replace).not.toHaveBeenCalled()
  })
})
