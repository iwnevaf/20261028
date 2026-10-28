import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { newPasswordError } from '../../lib/account'

const body = z.object({ currentPassword: z.string(), newPassword: z.string() })

// 本人によるパスワード変更。他のセッションは失効させ、このセッションだけ新しい世代で発行し直す
export default defineEventHandler(async (event) => {
  const me = await requireUser(event)
  const parsed = await readValidatedBody(event, body.safeParse)
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: '現在のパスワードと新しいパスワードを入力してください' })
  const { currentPassword, newPassword } = parsed.data

  const db = useDb()
  const user = db.select().from(schema.users).where(eq(schema.users.id, me.id)).get()
  if (!user) throw createError({ statusCode: 401, statusMessage: 'ログインしてください' })
  // 401 だとログイン切れと区別しにくいため 400 で返す
  if (!(await verifyPassword(user.passwordHash, currentPassword))) {
    throw createError({ statusCode: 400, statusMessage: '現在のパスワードが正しくありません' })
  }
  const err = newPasswordError(newPassword, currentPassword)
  if (err) throw createError({ statusCode: 400, statusMessage: err })

  const sessionVersion = user.sessionVersion + 1
  db.update(schema.users).set({ passwordHash: await hashPassword(newPassword), sessionVersion })
    .where(eq(schema.users.id, user.id)).run()
  await replaceUserSession(event, { user: me, secure: { sessionVersion } })
  return { ok: true }
})
