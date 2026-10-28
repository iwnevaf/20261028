import { z } from 'zod'

// プロバイダ共通: 抽出項目・JSON スキーマ・プロンプト・出力の検証
export const EXTRACT_FIELDS = ['name', 'companyName', 'department', 'title', 'email', 'phone', 'address', 'website'] as const
export type ExtractField = typeof EXTRACT_FIELDS[number]
export type Extraction = Record<ExtractField, string>

const descriptions: Record<ExtractField, string> = {
  name: '人物の氏名のみ（会社名・役職・敬称は含めない）',
  companyName: '会社名・組織名',
  department: '部署名',
  title: '役職',
  email: 'メールアドレス',
  phone: '電話番号（複数ある場合は代表的な1つ。記載どおりの表記）',
  address: '住所（郵便番号が記載されていれば含める）',
  website: 'WebサイトのURL',
}

export const extractionJsonSchema = {
  type: 'object',
  properties: Object.fromEntries(EXTRACT_FIELDS.map(k => [k, { type: 'string', description: descriptions[k] }])),
  required: [...EXTRACT_FIELDS],
  additionalProperties: false,
} as const

export const SYSTEM_PROMPT = [
  'あなたは名刺画像から情報を書き写す担当者です。',
  '名刺に印刷されている文字だけを、そのまま書き写してください。',
  '- 記載がない項目、または読み取れない項目は空文字 "" にする。',
  '- 推測・補完は禁止。例: メールアドレスのドメインから Web サイトを作らない、記載のない郵便番号・市外局番・会社名を補わない。',
  '- 表記は名刺の記載どおりに保つ（全角/半角・ハイフン・括弧などを変換しない）。',
  '- name は人物の氏名のみ。会社名・役職・敬称・ふりがなは含めない。',
  '- 複数の候補がある場合は、名刺の主たる人物・主たる連絡先を選ぶ。',
  '- 指定された JSON 形式のみを出力する。',
].join('\n')

export const USER_PROMPT = 'この名刺画像から、氏名・会社名・部署・役職・メールアドレス・電話番号・住所・Webサイトを書き写してください。'

const MAX_LEN: Record<ExtractField, number> = {
  name: 200,
  companyName: 500,
  department: 500,
  title: 500,
  email: 254,
  phone: 100,
  address: 500,
  website: 500,
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
// http(s):// 付き URL、または www.example.co.jp のようなドメイン表記
const WEBSITE_RE = /^(https?:\/\/)?[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+(:\d+)?([/?#]\S*)?$/i

const loose = z.record(z.string(), z.unknown())

// LLM の出力をそのまま信用せず、8項目すべて文字列に揃える
export function sanitizeExtraction(raw: unknown): Extraction {
  const parsed = loose.safeParse(raw)
  const obj = parsed.success ? parsed.data : {}
  const out = {} as Extraction
  for (const key of EXTRACT_FIELDS) {
    const v = obj[key]
    out[key] = typeof v === 'string' ? v.trim().slice(0, MAX_LEN[key]) : ''
  }
  if (out.email && !EMAIL_RE.test(out.email)) out.email = ''
  if (out.website && !WEBSITE_RE.test(out.website)) out.website = ''
  return out
}
