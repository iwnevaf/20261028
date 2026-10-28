// 名刺の8項目の検証と、企業・部署・人物レコードの解決。登録と編集で同じ規則を使う
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'

const field = z.string().trim().max(500).default('')
export const cardFieldsSchema = z.object({
  name: z.string().trim().min(1, '氏名は必須です').max(200),
  companyName: field,
  department: field,
  title: field,
  email: field,
  phone: field,
  address: field,
  website: field,
})
export type CardFields = z.infer<typeof cardFieldsSchema>

// 8項目以外（createdBy など）は捨てる。不正なら 400
export function parseCardFields(raw: unknown): CardFields {
  const parsed = cardFieldsSchema.safeParse(raw ?? {})
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: parsed.error.issues[0]?.message ?? '入力が不正です' })
  return parsed.data
}

type Db = ReturnType<typeof useDb>
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

type CurrentPerson = { personId: number, name: string, email: string }

// 正規化名で既存の企業・部署・人物に紐付け、なければ作成する（トランザクション内で呼ぶ）。
// 編集時は current を渡す。氏名・メールの正規化値が変わっていなければ人物 ID をそのまま使う
// （メールのない名刺を編集するたびに別人扱いになり、人物の許可が外れるのを防ぐ）
export function resolveCardEntities(tx: Tx | Db, f: CardFields, current?: CurrentPerson) {
  let companyId: number | null = null
  let departmentId: number | null = null
  const companyKey = normalizeName(f.companyName)
  if (companyKey) {
    companyId = tx.select().from(schema.companies).where(eq(schema.companies.normalizedName, companyKey)).get()?.id
      ?? tx.insert(schema.companies).values({ name: f.companyName, normalizedName: companyKey }).returning().get().id
    const deptKey = normalizeName(f.department)
    if (deptKey) {
      departmentId = tx.select().from(schema.departments)
        .where(and(eq(schema.departments.companyId, companyId), eq(schema.departments.normalizedName, deptKey))).get()?.id
        ?? tx.insert(schema.departments).values({ companyId, name: f.department, normalizedName: deptKey }).returning().get().id
    }
  }

  // 氏名とメールアドレスが一致する場合のみ既存の人物とみなす。メールがなければ別人として扱う
  const nameKey = normalizeName(f.name)
  const emailKey = normalizeEmail(f.email) || null
  const samePerson = current
    && normalizeName(current.name) === nameKey
    && (normalizeEmail(current.email) || null) === emailKey
  const findPerson = () => emailKey
    ? tx.select().from(schema.persons)
        .where(and(eq(schema.persons.normalizedName, nameKey), eq(schema.persons.normalizedEmail, emailKey))).get()?.id
    : undefined
  const personId = (samePerson ? current.personId : findPerson())
    ?? tx.insert(schema.persons).values({ name: f.name, normalizedName: nameKey, normalizedEmail: emailKey }).returning().get().id

  return { companyId, departmentId, personId }
}
