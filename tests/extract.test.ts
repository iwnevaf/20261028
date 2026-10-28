import { beforeEach, describe, expect, it, vi } from 'vitest'
import { extractionJsonSchema, EXTRACT_FIELDS, sanitizeExtraction } from '../server/lib/extract/schema'

// SDK をモックし、ネットワークには出ない
const { create, ctor } = vi.hoisted(() => ({ create: vi.fn(), ctor: vi.fn() }))
vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    interactions = { create }
    constructor(opts: unknown) { ctor(opts) }
  },
}))

const { extractCard, ExtractError } = await import('../server/lib/extract')

const empty = Object.fromEntries(EXTRACT_FIELDS.map(k => [k, '']))
const image = { data: Buffer.from([0x89, 0x50, 0x4E, 0x47]), mime: 'image/png' }
// 架空のデータ
const sample = {
  name: '山田 太郎',
  companyName: '架空商事株式会社',
  department: '営業部',
  title: '課長',
  email: 'taro@example.com',
  phone: '03-0000-0000',
  address: '〒000-0000 東京都架空区1-2-3',
  website: 'https://example.com',
}

describe('extractionJsonSchema', () => {
  it('8項目すべて文字列・必須・追加プロパティなし', () => {
    expect(Object.keys(extractionJsonSchema.properties)).toEqual([...EXTRACT_FIELDS])
    expect(extractionJsonSchema.required).toEqual([...EXTRACT_FIELDS])
    expect(extractionJsonSchema.additionalProperties).toBe(false)
    for (const p of Object.values(extractionJsonSchema.properties)) expect(p.type).toBe('string')
  })
})

describe('sanitizeExtraction', () => {
  it('正しい出力はそのまま返す', () => {
    expect(sanitizeExtraction(sample)).toEqual(sample)
  })

  it('欠けている項目・文字列以外は空欄', () => {
    expect(sanitizeExtraction({ name: '山田 太郎', phone: 123, email: null })).toEqual({ ...empty, name: '山田 太郎' })
  })

  it('オブジェクト以外は全項目空欄', () => {
    expect(sanitizeExtraction(null)).toEqual(empty)
    expect(sanitizeExtraction('text')).toEqual(empty)
    expect(sanitizeExtraction(['a'])).toEqual(empty)
  })

  it('前後の空白を除去する', () => {
    expect(sanitizeExtraction({ name: '  山田 太郎\n', companyName: '　架空商事　' })).toMatchObject({ name: '山田 太郎', companyName: '架空商事' })
  })

  it('メールアドレスの形でない値は空欄', () => {
    expect(sanitizeExtraction({ email: 'taro at example.com' }).email).toBe('')
    expect(sanitizeExtraction({ email: 'taro@example' }).email).toBe('')
  })

  it('URL・ドメインの形でない値は空欄', () => {
    expect(sanitizeExtraction({ website: '架空商事ホームページ' }).website).toBe('')
    expect(sanitizeExtraction({ website: 'javascript:alert(1)' }).website).toBe('')
    expect(sanitizeExtraction({ website: 'www.example.co.jp' }).website).toBe('www.example.co.jp')
    expect(sanitizeExtraction({ website: 'http://example.com/ja/' }).website).toBe('http://example.com/ja/')
  })

  it('長すぎる値は切り詰める', () => {
    expect(sanitizeExtraction({ address: 'あ'.repeat(1000) }).address).toHaveLength(500)
  })

  it('スキーマ外の項目は捨てる', () => {
    expect(sanitizeExtraction({ ...sample, extra: 'x' })).toEqual(sample)
  })
})

describe('extractCard', () => {
  beforeEach(() => {
    create.mockReset()
    ctor.mockReset()
  })

  it('API キー未設定なら missing_key（SDK を呼ばない）', async () => {
    const err = await extractCard(image, { llmProvider: 'gemini', geminiApiKey: '' }).catch(e => e)
    expect(err).toBeInstanceOf(ExtractError)
    expect(err.kind).toBe('missing_key')
    expect(err.statusCode).toBe(503)
    expect(err.message).toBe('AI読み取りの設定がありません（APIキー未設定）')
    expect(create).not.toHaveBeenCalled()
  })

  it('未対応のプロバイダはエラー', async () => {
    const err = await extractCard(image, { llmProvider: 'unknown', geminiApiKey: 'k' }).catch(e => e)
    expect(err.kind).toBe('unsupported_provider')
  })

  it('プロバイダ未指定なら Gemini を使い、出力を整形して返す', async () => {
    create.mockResolvedValue({ output_text: JSON.stringify({ ...sample, website: 'not a url', email: ' taro@example.com ' }) })
    const res = await extractCard(image, { geminiApiKey: 'test-key' })
    expect(res).toEqual({ ...sample, website: '' })
    expect(ctor).toHaveBeenCalledWith({ apiKey: 'test-key' })
    const params = create.mock.calls[0]![0]
    expect(params.model).toBe('gemini-3.5-flash-lite')
    expect(params.store).toBe(false)
    expect(params.response_format).toMatchObject({ type: 'text', mime_type: 'application/json', schema: extractionJsonSchema })
    expect(params.input[1]).toEqual({ type: 'image', data: image.data.toString('base64'), mime_type: 'image/png' })
  })

  it('モデル名は設定で変えられる', async () => {
    create.mockResolvedValue({ output_text: '{}' })
    await extractCard(image, { geminiApiKey: 'k', geminiModel: 'gemini-other' })
    expect(create.mock.calls[0]![0].model).toBe('gemini-other')
  })

  it('JSON でない出力は invalid_output', async () => {
    create.mockResolvedValue({ output_text: 'すみません、読み取れません' })
    const err = await extractCard(image, { geminiApiKey: 'k' }).catch(e => e)
    expect(err.kind).toBe('invalid_output')
    expect(err.statusCode).toBe(502)
  })

  it('空の出力は invalid_output', async () => {
    create.mockResolvedValue({})
    expect((await extractCard(image, { geminiApiKey: 'k' }).catch(e => e)).kind).toBe('invalid_output')
  })

  it('SDK のエラーは provider エラー（詳細は cause のみ）', async () => {
    create.mockRejectedValue(new Error('upstream detail'))
    const err = await extractCard(image, { geminiApiKey: 'k' }).catch(e => e)
    expect(err.kind).toBe('provider')
    expect(err.message).not.toContain('upstream detail')
  })

  it('中断されたら timeout', async () => {
    const controller = new AbortController()
    create.mockImplementation(async () => {
      controller.abort()
      throw new Error('aborted')
    })
    const err = await extractCard(image, { geminiApiKey: 'k' }, controller.signal).catch(e => e)
    expect(err.kind).toBe('timeout')
  })
})
