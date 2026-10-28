// 会社名・部署名・氏名の表記揺れ（全半角・空白・大文字小文字）を吸収した比較用キー
export function normalizeName(value: string | null | undefined): string {
  return (value ?? '').normalize('NFKC').replace(/\s+/g, '').toLowerCase()
}

export function normalizeEmail(value: string | null | undefined): string {
  return (value ?? '').normalize('NFKC').trim().toLowerCase()
}
