// role 変更・パスワード変更の可否判定（DB に依存しない純粋な関数。API とユニットテストで共有する）
export type Role = 'admin' | 'user'

export const PASSWORD_MIN_LENGTH = 8

export function roleChangeError(p: {
  actorId: number
  targetId: number
  currentRole: Role
  newRole: Role
  adminCount: number
}): string | null {
  // 自分自身の role は変更不可（自分を締め出す事故を防ぐ）
  if (p.actorId === p.targetId) return '自分の role は変更できません'
  if (p.currentRole === p.newRole) return null
  if (p.currentRole === 'admin' && p.adminCount <= 1) return 'admin が1人もいなくなるため変更できません'
  return null
}

export function newPasswordError(newPassword: string, currentPassword?: string): string | null {
  if (newPassword.length < PASSWORD_MIN_LENGTH) return `パスワードは${PASSWORD_MIN_LENGTH}文字以上にしてください`
  if (currentPassword !== undefined && newPassword === currentPassword) return '新しいパスワードは現在のパスワードと異なるものにしてください'
  return null
}
