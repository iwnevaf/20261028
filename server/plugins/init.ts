import { resolve } from 'node:path'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { eq } from 'drizzle-orm'

// 起動時にマイグレーションを適用し、admin が1人もいなければ環境変数の初期 admin を作成する
export default defineNitroPlugin(async () => {
  const db = useDb()
  migrate(db, { migrationsFolder: resolve('server/db/migrations') })

  const config = useRuntimeConfig()
  const existing = db.select().from(schema.users).where(eq(schema.users.role, 'admin')).get()
  if (existing) return

  const email = normalizeEmail(config.initialAdminEmail)
  if (!email || !config.initialAdminPassword) {
    console.warn('[init] admin が未登録です。NUXT_INITIAL_ADMIN_EMAIL / NUXT_INITIAL_ADMIN_PASSWORD を設定して再起動してください')
    return
  }
  db.insert(schema.users).values({
    email,
    name: config.initialAdminName || 'admin',
    passwordHash: await hashPassword(config.initialAdminPassword),
    role: 'admin',
  }).run()
  console.info(`[init] 初期 admin を作成しました: ${email}`)
})
