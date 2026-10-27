import { PublicShell } from './AppShell'

export function NotConfigured() {
  return (
    <PublicShell>
      <h1 className="font-display text-2xl font-bold">Setup needed</h1>
      <p className="mt-2 text-muted">
        This NFC Baby site is deployed but not connected to its database yet. The site owner needs
        to add the Supabase environment variables (see <code>docs/ENVIRONMENT.md</code>). Nothing
        can be recorded until then.
      </p>
    </PublicShell>
  )
}
