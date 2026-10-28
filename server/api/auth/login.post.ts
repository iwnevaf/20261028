import { z } from 'zod'
import { eq } from 'drizzle-orm'

const body = z.object({ email: z.string(), password: z.string() })

export default defineEventHandler(async (event) => {
  const { email, password } = await readValidatedBody(event, body.parse)
  const user = useDb().select().from(schema.users)
    .where(eq(schema.users.email, normalizeEmail(email))).get()

  // 未登録とパスワード誤りを区別しない
  if (!user || !(await verifyPassword(user.passwordHash, password))) {
    throw createError({ statusCode: 401, statusMessage: 'メールアドレスまたはパスワードが正しくありません' })
  }
  const sessionUser = { id: user.id, email: user.email, name: user.name, role: user.role }
  await replaceUserSession(event, { user: sessionUser })
  return sessionUser
})
