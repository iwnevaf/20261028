// 抽出結果と期待結果を項目ごとに比較する（scripts/eval-extract.mjs から利用。依存なしの純粋関数）

export const FIELDS = ['name', 'companyName', 'department', 'title', 'email', 'phone', 'address', 'website']

// 電話番号で同一視するハイフン類（ハイフン・各種ダッシュ・長音・マイナス）
const PHONE_HYPHENS = /[‐‑‒–—―−ーｰ-]/g

function base(value) {
  if (value === null || value === undefined) return ''
  return String(value).normalize('NFKC').replace(/\s+/g, '')
}

// 項目ごとの正規化。比較のためだけに使い、表示や保存には使わない
export function normalizeField(field, value) {
  const v = base(value)
  switch (field) {
    case 'phone':
      return v.replace(PHONE_HYPHENS, '')
    case 'email':
      return v.toLowerCase()
    case 'website':
      return v.toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, '')
    default:
      return v
  }
}

// 1項目の判定。hallucination = 期待が空欄なのに値が入っている（推測による補完）
export function compareField(field, expected, actual) {
  const e = normalizeField(field, expected)
  const a = normalizeField(field, actual)
  return { match: e === a, hallucination: e === '' && a !== '' }
}

/**
 * @typedef {{ match: boolean, hallucination: boolean }} FieldResult
 * @typedef {Record<'name' | 'companyName' | 'department' | 'title' | 'email' | 'phone' | 'address' | 'website', FieldResult>} CardResult
 */

// 1枚分の判定。actual が null（抽出失敗）なら全項目を不一致として扱う
/** @returns {CardResult} */
export function compareCard(expected, actual) {
  const result = /** @type {CardResult} */ ({})
  for (const field of FIELDS) {
    result[field] = actual
      ? compareField(field, expected?.[field], actual[field])
      : { match: false, hallucination: false }
  }
  return result
}

// 集計。failed（抽出失敗）の画像も分母に含める
export function summarize(rows) {
  const perField = Object.fromEntries(FIELDS.map(f => [f, { match: 0, total: 0, hallucination: 0 }]))
  let match = 0
  let total = 0
  let hallucination = 0
  let failed = 0
  for (const row of rows) {
    if (row.failed) failed++
    for (const field of FIELDS) {
      const r = row.result[field]
      perField[field].total++
      total++
      if (r.match) { perField[field].match++; match++ }
      if (r.hallucination) { perField[field].hallucination++; hallucination++ }
    }
  }
  return { images: rows.length, failed, match, total, hallucination, perField }
}

export function percent(match, total) {
  return total === 0 ? '-' : `${(match / total * 100).toFixed(1)}%`
}
