import { eq, sql } from 'drizzle-orm'

// Cookie の削除だけでは控えた Cookie を再送されると使えてしまうため、サーバー側でも失効させる
export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  const id = session.user?.id
  if (typeof id === 'number') {
    useDb().update(schema.users)
      .set({ sessionVersion: sql`${schema.users.sessionVersion} + 1` })
      .where(eq(schema.users.id, id)).run()
  }
  await clearUserSession(event)
  return { ok: true }
})
