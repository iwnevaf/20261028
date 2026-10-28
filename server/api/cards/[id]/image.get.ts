import { readFile } from 'node:fs/promises'
import { basename, join } from 'node:path'

// 元画像は public に置かず、権限チェック後にのみ返す
export default defineEventHandler(async (event) => {
  const card = await requireVisibleCard(event)
  const data = await readFile(join(useRuntimeConfig().uploadDir, basename(card.imagePath))).catch(() => null)
  if (!data) throw createError({ statusCode: 404, statusMessage: '画像が見つかりません' })
  setHeader(event, 'Content-Type', card.imageMime)
  setHeader(event, 'Cache-Control', 'private, no-store')
  return data
})
