import { randomUUID } from 'node:crypto'
import { mkdir, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { detectImageType, MAX_IMAGE_BYTES } from '../../lib/image'

const field = z.string().trim().max(500).default('')
const fields = z.object({
  name: z.string().trim().min(1, '氏名は必須です').max(200),
  companyName: field,
  department: field,
  title: field,
  email: field,
  phone: field,
  address: field,
  website: field,
})

export default defineEventHandler(async (event) => {
  // 登録者は常にログイン中の利用者。リクエストからは受け取らない
  const user = await requireUser(event)
  const parts = await readMultipartFormData(event)
  const image = parts?.find(p => p.name === 'image')
  const raw = Object.fromEntries((parts ?? []).filter(p => p.name && p.name !== 'image').map(p => [p.name, p.data.toString('utf8')]))

  if (!image?.data.length) throw createError({ statusCode: 400, statusMessage: '名刺画像を選択してください' })
  if (image.data.length > MAX_IMAGE_BYTES) throw createError({ statusCode: 400, statusMessage: '画像サイズは10MB以下にしてください' })
  const type = detectImageType(image.data)
  if (!type) throw createError({ statusCode: 400, statusMessage: '対応している画像形式は JPEG / PNG / WebP です' })

  const parsed = fields.safeParse(raw)
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: parsed.error.issues[0]?.message ?? '入力が不正です' })
  const f = parsed.data

  const dir = useRuntimeConfig().uploadDir
  await mkdir(dir, { recursive: true })
  const fileName = `${randomUUID()}.${type.ext}`
  const filePath = join(dir, fileName)
  await writeFile(filePath, image.data)

  try {
    const db = useDb()
    return db.transaction((tx) => {
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
      const personId = (emailKey
        ? tx.select().from(schema.persons)
            .where(and(eq(schema.persons.normalizedName, nameKey), eq(schema.persons.normalizedEmail, emailKey))).get()?.id
        : undefined)
        ?? tx.insert(schema.persons).values({ name: f.name, normalizedName: nameKey, normalizedEmail: emailKey }).returning().get().id

      return tx.insert(schema.cards).values({
        ...f,
        personId,
        companyId,
        departmentId,
        imagePath: fileName,
        imageMime: type.mime,
        createdBy: user.id,
      }).returning({ id: schema.cards.id }).get()
    })
  }
  catch (e) {
    await unlink(filePath).catch(() => {})
    console.error('[cards] 保存に失敗', e)
    throw createError({ statusCode: 500, statusMessage: '保存に失敗しました。もう一度お試しください' })
  }
})
