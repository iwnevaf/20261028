import { and, desc, eq, or, sql } from 'drizzle-orm'
import { scopeWhere } from '../../lib/access'

// 閲覧権限のある名刺のみ返す。q で氏名・会社名を部分一致検索
export default defineEventHandler(async (event) => {
  const { scope } = await requireScope(event)
  const q = String(getQuery(event).q ?? '').trim()
  const pattern = `%${q.replace(/[\\%_]/g, c => `\\${c}`)}%`
  const search = q
    ? or(
        sql`${schema.cards.name} like ${pattern} escape '\\'`,
        sql`${schema.cards.companyName} like ${pattern} escape '\\'`,
      )
    : undefined

  return useDb().select({
    id: schema.cards.id,
    name: schema.cards.name,
    companyName: schema.cards.companyName,
    department: schema.cards.department,
    title: schema.cards.title,
    email: schema.cards.email,
    phone: schema.cards.phone,
    createdAt: schema.cards.createdAt,
    createdByEmail: schema.users.email,
  })
    .from(schema.cards)
    .innerJoin(schema.users, eq(schema.cards.createdBy, schema.users.id))
    .where(and(scopeWhere(scope), search))
    .orderBy(desc(schema.cards.id))
    .all()
})
