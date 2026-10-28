import type { H3Event } from 'h3'
import { eq } from 'drizzle-orm'

export type CurrentUser = { id: number, email: string, name: string, role: 'admin' | 'user' }

// セッションには利用者 ID だけを持ち、role は毎回 DB から読む（role 変更・削除を即時反映するため）
export async function requireUser(event: H3Event): Promise<CurrentUser> {
  const session = await getUserSession(event)
  const id = session.user?.id
  if (typeof id !== 'number') throw createError({ statusCode: 401, statusMessage: 'ログインしてください' })

  const user = useDb().select().from(schema.users).where(eq(schema.users.id, id)).get()
  if (!user || session.secure?.sessionVersion !== user.sessionVersion) {
    await clearUserSession(event)
    throw createError({ statusCode: 401, statusMessage: 'ログインしてください' })
  }
  return { id: user.id, email: user.email, name: user.name, role: user.role }
}

export async function requireAdmin(event: H3Event): Promise<CurrentUser> {
  const user = await requireUser(event)
  if (user.role !== 'admin') throw createError({ statusCode: 403, statusMessage: '管理者のみ操作できます' })
  return user
}
