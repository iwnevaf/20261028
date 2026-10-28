import { z } from 'zod'
import { and, eq } from 'drizzle-orm'

const id = z.coerce.number().int().positive()
const body = z.discriminatedUnion('type', [
  z.object({ type: z.literal('company'), companyId: id }),
  z.object({ type: z.literal('department'), departmentId: id }),
  z.object({ type: z.literal('person'), personId: id }),
])

type GrantValues = {
  type: 'company' | 'department' | 'person'
  companyId: number | null
  departmentId: number | null
  personId: number | null
}

// 閲覧許可の付与（admin のみ）。対象は文字列ではなく ID で指定する
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const userId = Number(getRouterParam(event, 'id'))
  const db = useDb()
  const user = Number.isInteger(userId)
    ? db.select().from(schema.users).where(eq(schema.users.id, userId)).get()
    : undefined
  if (!user) throw createError({ statusCode: 404, statusMessage: '利用者が見つかりません' })
  if (user.role !== 'user') throw createError({ statusCode: 400, statusMessage: 'admin は全名刺を閲覧できるため許可は不要です' })

  const parsed = await readValidatedBody(event, body.safeParse)
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: '許可の種類と対象を指定してください' })
  const b = parsed.data

  let values: GrantValues
  if (b.type === 'company') {
    if (!db.select().from(schema.companies).where(eq(schema.companies.id, b.companyId)).get()) {
      throw createError({ statusCode: 400, statusMessage: '指定された企業が見つかりません' })
    }
    values = { type: 'company', companyId: b.companyId, departmentId: null, personId: null }
  }
  else if (b.type === 'department') {
    const d = db.select().from(schema.departments).where(eq(schema.departments.id, b.departmentId)).get()
    if (!d) throw createError({ statusCode: 400, statusMessage: '指定された部署が見つかりません' })
    // 部署は所属企業とセットで保存する
    values = { type: 'department', companyId: d.companyId, departmentId: d.id, personId: null }
  }
  else {
    if (!db.select().from(schema.persons).where(eq(schema.persons.id, b.personId)).get()) {
      throw createError({ statusCode: 400, statusMessage: '指定された人物が見つかりません' })
    }
    values = { type: 'person', companyId: null, departmentId: null, personId: b.personId }
  }

  const target = values.type === 'company'
    ? eq(schema.grants.companyId, values.companyId!)
    : values.type === 'department'
      ? eq(schema.grants.departmentId, values.departmentId!)
      : eq(schema.grants.personId, values.personId!)
  const dup = db.select().from(schema.grants)
    .where(and(eq(schema.grants.userId, userId), eq(schema.grants.type, values.type), target)).get()
  if (dup) throw createError({ statusCode: 409, statusMessage: 'この許可は付与済みです' })

  setResponseStatus(event, 201)
  return db.insert(schema.grants).values({ userId, ...values }).returning().get()
})
