import { eq } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { accessScope, canView } from '../lib/access'

export async function requireScope(event: H3Event) {
  const user = await requireUser(event)
  const grants = useDb().select().from(schema.grants).where(eq(schema.grants.userId, user.id)).all()
  return { user, scope: accessScope(user, grants) }
}

// 権限がない名刺は存在しない場合と同じ 404 を返す（ID の存在を漏らさない）
export async function requireVisibleCard(event: H3Event) {
  const id = Number(getRouterParam(event, 'id'))
  const notFound = createError({ statusCode: 404, statusMessage: '名刺が見つかりません' })
  if (!Number.isInteger(id)) throw notFound
  const { scope } = await requireScope(event)
  const card = useDb().select().from(schema.cards).where(eq(schema.cards.id, id)).get()
  if (!card || !canView(scope, card)) throw notFound
  return card
}
