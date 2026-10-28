export type ExtractErrorKind = 'missing_key' | 'unsupported_provider' | 'timeout' | 'provider' | 'invalid_output'

const MESSAGES: Record<ExtractErrorKind, string> = {
  missing_key: 'AI読み取りの設定がありません（APIキー未設定）',
  unsupported_provider: 'AI読み取りの設定が正しくありません',
  timeout: 'AI読み取りがタイムアウトしました。もう一度お試しください',
  provider: 'AI読み取りに失敗しました。もう一度お試しください',
  invalid_output: 'AI読み取りの結果を解釈できませんでした。もう一度お試しください',
}

// message は利用者向けの日本語。詳細（プロバイダのエラー）は cause に入れ、サーバーログにだけ出す
export class ExtractError extends Error {
  readonly kind: ExtractErrorKind
  readonly statusCode: number

  constructor(kind: ExtractErrorKind, options?: { cause?: unknown }) {
    super(MESSAGES[kind], options)
    this.name = 'ExtractError'
    this.kind = kind
    this.statusCode = kind === 'missing_key' || kind === 'unsupported_provider' ? 503 : 502
  }
}
