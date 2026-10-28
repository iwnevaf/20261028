import { eq } from 'drizzle-orm'

// 許可付与画面の選択肢。人物は同姓同名を見分けられるよう名刺上の会社名・メールも返す
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const db = useDb()
  const companies = db.select({ id: schema.companies.id, name: schema.companies.name })
    .from(schema.companies).orderBy(schema.companies.name).all()
  const departments = db.select({
    id: schema.departments.id,
    name: schema.departments.name,
    companyId: schema.departments.companyId,
    companyName: schema.companies.name,
  }).from(schema.departments)
    .innerJoin(schema.companies, eq(schema.departments.companyId, schema.companies.id))
    .orderBy(schema.companies.name, schema.departments.name).all()

  const rows = db.select({
    id: schema.persons.id,
    name: schema.persons.name,
    companyName: schema.cards.companyName,
    email: schema.cards.email,
  }).from(schema.persons)
    .innerJoin(schema.cards, eq(schema.cards.personId, schema.persons.id))
    .orderBy(schema.persons.name, schema.persons.id).all()
  const map = new Map<number, { id: number, name: string, companyNames: string[], emails: string[], cardCount: number }>()
  for (const r of rows) {
    let p = map.get(r.id)
    if (!p) map.set(r.id, p = { id: r.id, name: r.name, companyNames: [], emails: [], cardCount: 0 })
    p.cardCount++
    if (r.companyName && !p.companyNames.includes(r.companyName)) p.companyNames.push(r.companyName)
    if (r.email && !p.emails.includes(r.email)) p.emails.push(r.email)
  }
  return { companies, departments, persons: [...map.values()] }
})
