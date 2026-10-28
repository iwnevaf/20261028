import { detectImageType, MAX_IMAGE_BYTES } from '../../lib/image'
import { extractCard, ExtractError } from '../../lib/extract'

const TIMEOUT_MS = 30_000

// 画像は保存せず、AI で読み取った8項目だけを返す。登録は利用者の確認後に POST /api/cards で行う
export default defineEventHandler(async (event) => {
  await requireUser(event)
  const parts = await readMultipartFormData(event)
  const image = parts?.find(p => p.name === 'image')

  if (!image?.data.length) throw createError({ statusCode: 400, statusMessage: '名刺画像を選択してください' })
  if (image.data.length > MAX_IMAGE_BYTES) throw createError({ statusCode: 400, statusMessage: '画像サイズは10MB以下にしてください' })
  const type = detectImageType(image.data)
  if (!type) throw createError({ statusCode: 400, statusMessage: '対応している画像形式は JPEG / PNG / WebP です' })

  const config = useRuntimeConfig(event)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    return await extractCard({ data: image.data, mime: type.mime }, {
      llmProvider: config.llmProvider,
      geminiApiKey: config.geminiApiKey,
      geminiModel: config.geminiModel,
      anthropicApiKey: config.anthropicApiKey,
      anthropicModel: config.anthropicModel,
    }, controller.signal)
  }
  catch (e) {
    // ログには種別とプロバイダのエラーのみ。画像や抽出結果は出さない
    if (e instanceof ExtractError) {
      console.error(`[extract] ${e.kind}`, e.cause ?? '')
      throw createError({ statusCode: e.statusCode, statusMessage: e.message })
    }
    console.error('[extract] 想定外のエラー', e)
    throw createError({ statusCode: 500, statusMessage: 'AI読み取りに失敗しました。もう一度お試しください' })
  }
  finally {
    clearTimeout(timer)
  }
})
