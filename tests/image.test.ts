import { describe, expect, it } from 'vitest'
import { detectImageType, MAX_IMAGE_BYTES } from '../server/lib/image'

const bytes = (...b: number[]) => new Uint8Array([...b, ...new Array(16).fill(0)])
const ascii = (s: string) => Array.from(s, c => c.charCodeAt(0))

describe('detectImageType', () => {
  it('JPEG をマジックバイトで判定する', () => {
    expect(detectImageType(bytes(0xFF, 0xD8, 0xFF, 0xE0))).toEqual({ mime: 'image/jpeg', ext: 'jpg' })
  })

  it('PNG をマジックバイトで判定する', () => {
    expect(detectImageType(bytes(0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A))).toEqual({ mime: 'image/png', ext: 'png' })
  })

  it('WebP をマジックバイトで判定する', () => {
    expect(detectImageType(bytes(...ascii('RIFF'), 0x24, 0, 0, 0, ...ascii('WEBP'), ...ascii('VP8 ')))).toEqual({ mime: 'image/webp', ext: 'webp' })
  })

  it('GIF は対象外', () => {
    expect(detectImageType(bytes(...ascii('GIF89a')))).toBeNull()
  })

  it('テキストは対象外', () => {
    expect(detectImageType(new TextEncoder().encode('hello, this is not an image'))).toBeNull()
  })

  it('空データ・途中で切れたデータは対象外', () => {
    expect(detectImageType(new Uint8Array())).toBeNull()
    expect(detectImageType(new Uint8Array([0xFF, 0xD8]))).toBeNull()
    expect(detectImageType(new Uint8Array(ascii('RIFF')))).toBeNull()
  })

  it('RIFF でも WEBP 以外（WAV など）は対象外', () => {
    expect(detectImageType(bytes(...ascii('RIFF'), 0, 0, 0, 0, ...ascii('WAVE')))).toBeNull()
  })

  it('サイズ上限は 10MB', () => {
    expect(MAX_IMAGE_BYTES).toBe(10 * 1024 * 1024)
  })
})
