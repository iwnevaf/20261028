import Anthropic from '@anthropic-ai/sdk'
import { ExtractError } from './errors'
import { extractionJsonSchema, SYSTEM_PROMPT, USER_PROMPT } from './schema'
import type { ExtractImage } from './index'

export const DEFAULT_CLAUDE_MODEL = 'claude-opus-5-5'

type MediaType = Anthropic.Beta.BetaBase64ImageSource['media_type']
const MEDIA_TYPES: readonly string[] = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] satisfies MediaType[]

function isMediaType(mime: string): mime is MediaType {
  return MEDIA_TYPES.includes(mime)
}

// Claude Messages API の構造化出力（output_config.format）で8項目の JSON を得る
// Opus 5.5 は thinking を無効化できず temperature 等も受け付けないため、effort だけで深さを抑える
export async function extractWithClaude(image: ExtractImage, opts: { apiKey: string, model?: string, signal?: AbortSignal }): Promise<unknown> {
  if (!isMediaType(image.mime)) throw new ExtractError('provider')
  const client = new Anthropic({ apiKey: opts.apiKey })
  let message: Anthropic.Beta.BetaMessage
  try {
    message = await client.beta.messages.create({
      model: opts.model || DEFAULT_CLAUDE_MODEL,
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: image.mime, data: image.data.toString('base64') } },
          { type: 'text', text: USER_PROMPT },
        ],
      }],
      output_config: {
        effort: 'low',
        format: { type: 'json_schema', schema: extractionJsonSchema },
      },
      // 安全分類器による拒否時、サーバー側で既定の代替モデルに再実行させる
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    }, { signal: opts.signal })
  }
  catch (e) {
    throw toExtractError(e, opts.signal)
  }

  if (message.stop_reason === 'refusal') throw new ExtractError('provider', { cause: message.stop_details })
  if (message.stop_reason === 'max_tokens') throw new ExtractError('invalid_output', { cause: 'max_tokens' })

  // 代替モデルに切り替わった場合は、最後の切り替え以降のテキストだけを使う
  const lastFallback = message.content.findLastIndex(b => b.type === 'fallback')
  const text = message.content.slice(lastFallback + 1)
    .flatMap(b => b.type === 'text' ? [b.text] : [])
    .join('')
  if (!text) throw new ExtractError('invalid_output')
  try {
    return JSON.parse(text)
  }
  catch (e) {
    throw new ExtractError('invalid_output', { cause: e })
  }
}

// SDK の型付き例外で分類する（メッセージの文字列照合はしない）
function toExtractError(e: unknown, signal?: AbortSignal): ExtractError {
  if (signal?.aborted || e instanceof Anthropic.APIUserAbortError || e instanceof Anthropic.APIConnectionTimeoutError) {
    return new ExtractError('timeout', { cause: e })
  }
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
    return new ExtractError('invalid_key', { cause: e })
  }
  if (e instanceof Anthropic.RateLimitError) return new ExtractError('rate_limited', { cause: e })
  // その他の APIError（APIConnectionError・5xx など）と想定外の例外はプロバイダ側の失敗
  return new ExtractError('provider', { cause: e })
}
