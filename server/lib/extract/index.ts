import { ExtractError } from './errors'
import { extractWithClaude } from './claude'
import { extractWithGemini } from './gemini'
import { sanitizeExtraction, type Extraction } from './schema'

export { ExtractError } from './errors'
export type { Extraction } from './schema'

export type ExtractImage = { data: Buffer, mime: string }

export type ExtractConfig = {
  llmProvider?: string
  geminiApiKey?: string
  geminiModel?: string
  anthropicApiKey?: string
  anthropicModel?: string
}

// プロバイダの選択だけを行い、出力の検証・整形は共通の sanitizeExtraction に任せる
export async function extractCard(image: ExtractImage, config: ExtractConfig, signal?: AbortSignal): Promise<Extraction> {
  const provider = config.llmProvider || 'gemini'
  let raw: unknown
  switch (provider) {
    case 'gemini':
      if (!config.geminiApiKey) throw new ExtractError('missing_key')
      raw = await extractWithGemini(image, { apiKey: config.geminiApiKey, model: config.geminiModel, signal })
      break
    case 'claude':
      if (!config.anthropicApiKey) throw new ExtractError('missing_key')
      raw = await extractWithClaude(image, { apiKey: config.anthropicApiKey, model: config.anthropicModel, signal })
      break
    default:
      throw new ExtractError('unsupported_provider')
  }
  return sanitizeExtraction(raw)
}
