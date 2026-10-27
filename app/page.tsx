import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth/session'

export default async function Index() {
  const user = await getSessionUser()
  redirect(user ? '/dashboard' : '/login')
}
