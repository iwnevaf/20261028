import { describe, expect, it } from 'vitest'
import { FIELDS, compareCard, compareField, normalizeField, percent, summarize } from '../scripts/eval-compare.mjs'

// テストデータはすべて架空の値
const expected = {
  name: '架空 太郎',
  companyName: '株式会社テスト',
  department: '開発部',
  title: '',
  email: 'taro@example.com',
  phone: '03-0000-0000',
  address: '',
  website: 'https://example.com',
}

describe('normalizeField', () => {
  it('NFKC で全角英数字をそろえ、空白を除去する', () => {
    expect(normalizeField('companyName', '株式会社　ＴＥＳＴ ')).toBe('株式会社TEST')
    expect(normalizeField('name', '架空  太郎')).toBe('架空太郎')
  })

  it('電話番号はハイフン類・空白の違いを無視する', () => {
    const variants = ['03-0000-0000', '03‐0000‐0000', '03–0000—0000', '03ー0000ー0000', '０３－００００－００００', '03 0000 0000']
    for (const v of variants) expect(normalizeField('phone', v)).toBe('0300000000')
  })

  it('メールアドレスは大文字小文字を区別しない', () => {
    expect(normalizeField('email', 'Taro@Example.COM')).toBe('taro@example.com')
  })

  it('Web サイトはスキーム・末尾スラッシュ・大文字小文字を無視する', () => {
    for (const v of ['https://example.com', 'http://example.com/', 'EXAMPLE.com', 'example.com//']) {
      expect(normalizeField('website', v)).toBe('example.com')
    }
    expect(normalizeField('website', 'https://example.com/path')).toBe('example.com/path')
  })

  it('null / undefined は空文字', () => {
    expect(normalizeField('name', null)).toBe('')
    expect(normalizeField('name', undefined)).toBe('')
  })

  it('氏名など一般項目は大文字小文字を区別する', () => {
    expect(normalizeField('name', 'ABC')).not.toBe(normalizeField('name', 'abc'))
  })
})

describe('compareField', () => {
  it('一致・不一致を判定する', () => {
    expect(compareField('phone', '03-0000-0000', '03ー0000ー0000')).toEqual({ match: true, hallucination: false })
    expect(compareField('phone', '03-0000-0000', '03-0000-0001')).toEqual({ match: false, hallucination: false })
  })

  it('期待が空欄で値が入っていればハルシネーション', () => {
    expect(compareField('address', '', '東京都架空区')).toEqual({ match: false, hallucination: true })
    expect(compareField('address', '', '  ')).toEqual({ match: true, hallucination: false })
  })

  it('期待に値があり実際が空欄なのはハルシネーションではない', () => {
    expect(compareField('email', 'taro@example.com', '')).toEqual({ match: false, hallucination: false })
  })
})

describe('compareCard / summarize', () => {
  it('8項目を比較して集計する', () => {
    const actual = { ...expected, title: '部長', website: 'example.com/', phone: '' }
    const result = compareCard(expected, actual)
    expect(Object.keys(result)).toEqual(FIELDS)
    expect(result.title).toEqual({ match: false, hallucination: true })
    expect(result.website.match).toBe(true)
    expect(result.phone.match).toBe(false)

    const summary = summarize([{ image: 'a.jpg', failed: false, result }])
    expect(summary.total).toBe(8)
    expect(summary.match).toBe(6)
    expect(summary.hallucination).toBe(1)
    expect(summary.perField.title).toEqual({ match: 0, total: 1, hallucination: 1 })
  })

  it('抽出失敗（actual が null）は全項目不一致として分母に含める', () => {
    const ok = compareCard(expected, expected)
    const failed = compareCard(expected, null)
    expect(Object.values(failed).every(r => !r.match && !r.hallucination)).toBe(true)

    const summary = summarize([
      { image: 'a.jpg', failed: false, result: ok },
      { image: 'b.jpg', failed: true, result: failed },
    ])
    expect(summary.images).toBe(2)
    expect(summary.failed).toBe(1)
    expect(summary.match).toBe(8)
    expect(summary.total).toBe(16)
    expect(percent(summary.match, summary.total)).toBe('50.0%')
  })

  it('actual に欠けている項目は空欄として扱う', () => {
    const result = compareCard(expected, { name: '架空 太郎' })
    expect(result.name.match).toBe(true)
    expect(result.title.match).toBe(true)
    expect(result.email.match).toBe(false)
  })

  it('percent は分母 0 で "-"', () => {
    expect(percent(0, 0)).toBe('-')
  })
})
