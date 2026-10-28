// 対応画像形式: JPEG / PNG / WebP。拡張子や申告 MIME ではなく先頭バイトで判定する
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024

export function detectImageType(buf: Uint8Array): { mime: string, ext: string } | null {
  if (buf.length >= 3 && buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return { mime: 'image/jpeg', ext: 'jpg' }
  if (buf.length >= 8 && [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A].every((b, i) => buf[i] === b)) return { mime: 'image/png', ext: 'png' }
  const ascii = (s: number, e: number) => String.fromCharCode(...buf.subarray(s, e))
  if (buf.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return { mime: 'image/webp', ext: 'webp' }
  return null
}
