import { unlink } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { eq } from 'drizzle-orm'

// 名刺と元画像を削除する。企業・部署・人物は閲覧許可から参照されうるので残す
export default defineEventHandler(async (event) => {
  const { card } = await requireEditableCard(event)
  useDb().delete(schema.cards).where(eq(schema.cards.id, card.id)).run()
  // DB の削除が成功してから画像を消す（ファイルが既にない場合は無視）
  await unlink(join(useRuntimeConfig().uploadDir, basename(card.imagePath))).catch(() => {})
  return { ok: true }
})
