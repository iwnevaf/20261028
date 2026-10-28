import { z } from 'zod'
import { eq, sql } from 'drizzle-orm'
import { newPasswordError } from '../../../../lib/account'

const body = z.object({ newPassword: z.string() })

// admin による他の利用者のパスワード再設定。対象のセッションはすべて失効させる
export default defineEventHandler(async (event) => {
  const actor = await requireAdmin(event)
  const userId = Number(getRouterParam(event, 'id'))
  const db = useDb()
  const user = Number.isInteger(userId)
    ? db.select().from(schema.users).where(eq(schema.users.id, userId)).get()
    : undefined
  if (!user) throw createError({ statusCode: 404, statusMessage: '利用者が見つかりません' })
  if (user.id === actor.id) {
    throw createError({ statusCode: 400, statusMessage: '自分のパスワードはアカウント設定から変更してください' })
  }

  const parsed = await readValidatedBody(event, body.safeParse)
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: '新しいパスワードを入力してください' })
  const err = newPasswordError(parsed.data.newPassword)
  if (err) throw createError({ statusCode: 400, statusMessage: err })

  db.update(schema.users).set({
    passwordHash: await hashPassword(parsed.data.newPassword),
    sessionVersion: sql`${schema.users.sessionVersion} + 1`,
  }).where(eq(schema.users.id, user.id)).run()
  return { ok: true }
})
