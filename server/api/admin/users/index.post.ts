import { z } from 'zod'
import { eq } from 'drizzle-orm'

const body = z.object({
  email: z.email(),
  name: z.string().max(100).default(''),
  password: z.string().min(8, 'パスワードは8文字以上にしてください'),
})

// admin が一般利用者（user）を追加する。role は常に user で、リクエストからは受け取らない
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const parsed = await readValidatedBody(event, body.safeParse)
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: parsed.error.issues[0]?.message ?? '入力が不正です' })
  }
  const email = normalizeEmail(parsed.data.email)
  const db = useDb()
  if (db.select().from(schema.users).where(eq(schema.users.email, email)).get()) {
    throw createError({ statusCode: 409, statusMessage: 'このメールアドレスは登録済みです' })
  }
  const user = db.insert(schema.users).values({
    email,
    name: parsed.data.name,
    passwordHash: await hashPassword(parsed.data.password),
    role: 'user',
  }).returning({ id: schema.users.id, email: schema.users.email, name: schema.users.name, role: schema.users.role }).get()
  return user
})
