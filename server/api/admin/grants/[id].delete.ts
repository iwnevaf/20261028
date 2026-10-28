import { eq } from 'drizzle-orm'

// 閲覧許可の解除（admin のみ）
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const id = Number(getRouterParam(event, 'id'))
  const deleted = Number.isInteger(id)
    ? useDb().delete(schema.grants).where(eq(schema.grants.id, id)).returning({ id: schema.grants.id }).get()
    : undefined
  if (!deleted) throw createError({ statusCode: 404, statusMessage: '許可が見つかりません' })
  return { ok: true }
})
