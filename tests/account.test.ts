import { describe, expect, it } from 'vitest'
import { newPasswordError, roleChangeError } from '../server/lib/account'

describe('roleChangeError', () => {
  const base = { actorId: 1, targetId: 2, currentRole: 'user' as const, newRole: 'admin' as const, adminCount: 1 }

  it('他の user を admin に昇格できる', () => {
    expect(roleChangeError(base)).toBeNull()
  })

  it('自分の role は変更できない（admin が自分を user に下げる場合も）', () => {
    expect(roleChangeError({ ...base, targetId: 1, currentRole: 'admin', newRole: 'user', adminCount: 3 })).not.toBeNull()
    expect(roleChangeError({ ...base, targetId: 1, currentRole: 'admin', newRole: 'admin' })).not.toBeNull()
  })

  it('admin が2人以上いれば他の admin を user に戻せる', () => {
    expect(roleChangeError({ ...base, currentRole: 'admin', newRole: 'user', adminCount: 2 })).toBeNull()
  })

  it('最後の admin は user に戻せない（admin が0人になる）', () => {
    expect(roleChangeError({ ...base, currentRole: 'admin', newRole: 'user', adminCount: 1 })).toMatch('admin が1人もいなくなる')
    expect(roleChangeError({ ...base, currentRole: 'admin', newRole: 'user', adminCount: 0 })).not.toBeNull()
  })

  it('同じ role への変更はエラーにしない', () => {
    expect(roleChangeError({ ...base, currentRole: 'admin', newRole: 'admin', adminCount: 1 })).toBeNull()
  })
})

describe('newPasswordError', () => {
  it('8文字未満は不可', () => {
    expect(newPasswordError('1234567')).not.toBeNull()
    expect(newPasswordError('12345678')).toBeNull()
  })

  it('現在のパスワードと同じものは不可', () => {
    expect(newPasswordError('same-pass-1', 'same-pass-1')).not.toBeNull()
    expect(newPasswordError('new-pass-12', 'old-pass-12')).toBeNull()
  })
})
