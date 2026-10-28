import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const userId = Number(getRouterParam(event, 'id'))
  const db = useDb()
  const user = Number.isInteger(userId)
    ? db.select({ id: schema.users.id, email: schema.users.email, name: schema.users.name, role: schema.users.role })
      .from(schema.users).where(eq(schema.users.id, userId)).get()
    : undefined
  if (!user) throw createError({ statusCode: 404, statusMessage: '利用者が見つかりません' })

  const rows = db.select().from(schema.grants).where(eq(schema.grants.userId, userId))
    .orderBy(schema.grants.id).all()
  const grants = rows.map(g => ({ id: g.id, type: g.type, label: grantLabel(g), createdAt: g.createdAt }))
  return { user, grants }
})

// 画面表示用のラベル。人物は会社名・メールを添えて同姓同名と区別できるようにする
function grantLabel(g: typeof schema.grants.$inferSelect): string {
  const db = useDb()
  const companyName = (id: number | null) => id == null
    ? ''
    : db.select({ name: schema.companies.name }).from(schema.companies).where(eq(schema.companies.id, id)).get()?.name ?? ''
  if (g.type === 'company') return companyName(g.companyId) || '（削除済みの企業）'
  if (g.type === 'department') {
    const d = g.departmentId == null
      ? undefined
      : db.select().from(schema.departments).where(eq(schema.departments.id, g.departmentId)).get()
    if (!d) return '（削除済みの部署）'
    return `${companyName(d.companyId)} › ${d.name}`
  }
  const p = g.personId == null
    ? undefined
    : db.select().from(schema.persons).where(eq(schema.persons.id, g.personId)).get()
  if (!p) return '（削除済みの人物）'
  const cards = db.select({ companyName: schema.cards.companyName, email: schema.cards.email })
    .from(schema.cards).where(eq(schema.cards.personId, p.id)).all()
  const info = [...new Set(cards.flatMap(c => [c.companyName, c.email]).filter(Boolean))]
  return info.length ? `${p.name}（${info.join(', ')}）` : p.name
}
