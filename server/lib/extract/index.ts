import { ExtractError } from './errors'
import { extractWithGemini } from './gemini'
import { sanitizeExtraction, type Extraction } from './schema'

export { ExtractError } from './errors'
export type { Extraction } from './schema'

export type ExtractImage = { data: Buffer, mime: string }

export type ExtractConfig = {
  llmProvider?: string
  geminiApiKey?: string
  geminiModel?: string
}

// プロバイダの選択だけを行い、出力の検証・整形は共通の sanitizeExtraction に任せる
// Claude を追加する場合は claude.ts を作り、ここに分岐を1つ足す
export async function extractCard(image: ExtractImage, config: ExtractConfig, signal?: AbortSignal): Promise<Extraction> {
  const provider = config.llmProvider || 'gemini'
  let raw: unknown
  switch (provider) {
    case 'gemini':
      if (!config.geminiApiKey) throw new ExtractError('missing_key')
      raw = await extractWithGemini(image, { apiKey: config.geminiApiKey, model: config.geminiModel, signal })
      break
    default:
      throw new ExtractError('unsupported_provider')
  }
  return sanitizeExtraction(raw)
}
