import { GoogleGenAI } from '@google/genai'
import { ExtractError } from './errors'
import { extractionJsonSchema, SYSTEM_PROMPT, USER_PROMPT } from './schema'
import type { ExtractImage } from './index'

export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash-lite'

// Gemini Interactions API（@google/genai v2 の client.interactions.create）で構造化出力を得る
export async function extractWithGemini(image: ExtractImage, opts: { apiKey: string, model?: string, signal?: AbortSignal }): Promise<unknown> {
  const client = new GoogleGenAI({ apiKey: opts.apiKey })
  let text: string | undefined
  try {
    const interaction = await client.interactions.create({
      model: opts.model || DEFAULT_GEMINI_MODEL,
      system_instruction: SYSTEM_PROMPT,
      input: [
        { type: 'text', text: USER_PROMPT },
        { type: 'image', data: image.data.toString('base64'), mime_type: image.mime },
      ],
      response_format: { type: 'text', mime_type: 'application/json', schema: extractionJsonSchema },
      generation_config: { thinking_level: 'low' },
      // 名刺は個人情報なので、プロバイダ側に会話を保存させない
      store: false,
    }, { signal: opts.signal })
    text = interaction.output_text
  }
  catch (e) {
    if (opts.signal?.aborted) throw new ExtractError('timeout', { cause: e })
    throw new ExtractError('provider', { cause: e })
  }

  if (!text) throw new ExtractError('invalid_output')
  try {
    return JSON.parse(text)
  }
  catch (e) {
    throw new ExtractError('invalid_output', { cause: e })
  }
}
