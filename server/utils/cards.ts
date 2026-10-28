import { eq } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { accessScope, canEdit, canView } from '../lib/access'

export async function requireScope(event: H3Event) {
  const user = await requireUser(event)
  const grants = useDb().select().from(schema.grants).where(eq(schema.grants.userId, user.id)).all()
  return { user, scope: accessScope(user, grants) }
}

// 権限がない名刺は存在しない場合と同じ 404 を返す（ID の存在を漏らさない）
export async function loadVisibleCard(event: H3Event) {
  const id = Number(getRouterParam(event, 'id'))
  const notFound = createError({ statusCode: 404, statusMessage: '名刺が見つかりません' })
  if (!Number.isInteger(id)) throw notFound
  const { user, scope } = await requireScope(event)
  const card = useDb().select().from(schema.cards).where(eq(schema.cards.id, id)).get()
  if (!card || !canView(scope, card)) throw notFound
  return { user, card }
}

export async function requireVisibleCard(event: H3Event) {
  return (await loadVisibleCard(event)).card
}

// 編集・削除: 見えない名刺は 404、見えるが登録者でも admin でもなければ 403
export async function requireEditableCard(event: H3Event) {
  const { user, card } = await loadVisibleCard(event)
  if (!canEdit(user, card)) throw createError({ statusCode: 403, statusMessage: 'この名刺を編集・削除できるのは登録者と管理者のみです' })
  return { user, card }
}
