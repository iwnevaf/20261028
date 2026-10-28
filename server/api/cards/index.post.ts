import { randomUUID } from 'node:crypto'
import { mkdir, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { detectImageType, MAX_IMAGE_BYTES } from '../../lib/image'

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

  const f = parseCardFields(raw)

  const dir = useRuntimeConfig().uploadDir
  await mkdir(dir, { recursive: true })
  const fileName = `${randomUUID()}.${type.ext}`
  const filePath = join(dir, fileName)
  await writeFile(filePath, image.data)

  try {
    const db = useDb()
    return db.transaction((tx) => {
      const ids = resolveCardEntities(tx, f)
      return tx.insert(schema.cards).values({
        ...f,
        ...ids,
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
