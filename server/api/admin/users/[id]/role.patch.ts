import { z } from 'zod'
import { count, eq } from 'drizzle-orm'
import { roleChangeError } from '../../../../lib/account'

const body = z.object({ role: z.enum(['admin', 'user']) })

// role の変更（admin のみ）。requireUser が毎リクエスト DB の role を読むため、対象の次のリクエストから反映される
export default defineEventHandler(async (event) => {
  const actor = await requireAdmin(event)
  const userId = Number(getRouterParam(event, 'id'))
  const parsed = await readValidatedBody(event, body.safeParse)
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'role は admin または user を指定してください' })
  const newRole = parsed.data.role

  // admin 数の確認と更新を同じトランザクションで行い、同時操作で admin が0人になるのを防ぐ
  return useDb().transaction((tx) => {
    const user = Number.isInteger(userId)
      ? tx.select().from(schema.users).where(eq(schema.users.id, userId)).get()
      : undefined
    if (!user) throw createError({ statusCode: 404, statusMessage: '利用者が見つかりません' })

    const adminCount = tx.select({ n: count() }).from(schema.users)
      .where(eq(schema.users.role, 'admin')).get()?.n ?? 0
    const err = roleChangeError({ actorId: actor.id, targetId: user.id, currentRole: user.role, newRole, adminCount })
    if (err) throw createError({ statusCode: 400, statusMessage: err })

    return tx.update(schema.users).set({ role: newRole })
      .where(eq(schema.users.id, user.id))
      .returning({ id: schema.users.id, email: schema.users.email, name: schema.users.name, role: schema.users.role })
      .get()
  }, { behavior: 'immediate' })
})
