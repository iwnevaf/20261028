import { describe, expect, it } from 'vitest'
import { normalizeEmail, normalizeName } from '../server/utils/normalize'

describe('normalizeName', () => {
  it('全角英数字を半角にそろえる', () => {
    expect(normalizeName('ＡＢＣ商事')).toBe(normalizeName('ABC商事'))
    expect(normalizeName('第１営業部')).toBe('第1営業部')
  })

  it('半角カナを全角にそろえる', () => {
    expect(normalizeName('ｻﾝﾌﾟﾙ')).toBe('サンプル')
  })

  it('前後・途中の空白（全角空白・タブ含む）を除去する', () => {
    expect(normalizeName('  架空　太郎 ')).toBe('架空太郎')
    expect(normalizeName('Example\tCorp')).toBe('examplecorp')
  })

  it('大文字小文字を区別しない', () => {
    expect(normalizeName('Example Inc.')).toBe(normalizeName('EXAMPLE inc.'))
  })

  it('null / undefined / 空白のみは空文字', () => {
    expect(normalizeName(null)).toBe('')
    expect(normalizeName(undefined)).toBe('')
    expect(normalizeName('   ')).toBe('')
  })

  it('異なる名前は別のキーになる', () => {
    expect(normalizeName('営業部')).not.toBe(normalizeName('営業1部'))
  })
})

describe('normalizeEmail', () => {
  it('前後空白を除去し小文字にする', () => {
    expect(normalizeEmail('  Taro.Example@Example.COM ')).toBe('taro.example@example.com')
  })

  it('全角文字を半角にする', () => {
    expect(normalizeEmail('ｔａｒｏ＠ｅｘａｍｐｌｅ．ｃｏｍ')).toBe('taro@example.com')
  })

  it('null / undefined は空文字', () => {
    expect(normalizeEmail(null)).toBe('')
    expect(normalizeEmail(undefined)).toBe('')
  })
})
