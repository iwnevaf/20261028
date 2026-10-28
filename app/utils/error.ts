// $fetch のエラーからサーバーが返したメッセージを取り出す
export function errorMessage(e: unknown, fallback: string): string {
  const err = e as { data?: { statusMessage?: string, message?: string }, statusMessage?: string }
  return err?.data?.statusMessage || err?.data?.message || err?.statusMessage || fallback
}
