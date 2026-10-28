// 名刺の閲覧権限判定。一覧・検索・詳細・画像取得のすべてがここを経由する
import { eq, inArray, or, type SQL } from 'drizzle-orm'
import { cards } from '../db/schema'

export type Viewer = { id: number, role: 'admin' | 'user' }
export type Grant = {
  type: 'company' | 'department' | 'person'
  companyId: number | null
  departmentId: number | null
  personId: number | null
}
export type AccessScope =
  | { all: true }
  | { all: false, userId: number, companyIds: number[], departmentIds: number[], personIds: number[] }
export type CardRef = { createdBy: number, companyId: number | null, departmentId: number | null, personId: number }

export function accessScope(viewer: Viewer, grants: Grant[]): AccessScope {
  if (viewer.role === 'admin') return { all: true }
  const ids = (type: Grant['type'], key: 'companyId' | 'departmentId' | 'personId') =>
    grants.filter(g => g.type === type && g[key] != null).map(g => g[key] as number)
  return {
    all: false,
    userId: viewer.id,
    companyIds: ids('company', 'companyId'),
    // 部署 ID は企業ごとに別レコードなので、他社の同名部署には広がらない
    departmentIds: ids('department', 'departmentId'),
    // 人物 ID 単位なので、同姓同名の別人には広がらない
    personIds: ids('person', 'personId'),
  }
}

export function canView(scope: AccessScope, card: CardRef): boolean {
  if (scope.all) return true
  return card.createdBy === scope.userId
    || (card.companyId != null && scope.companyIds.includes(card.companyId))
    || (card.departmentId != null && scope.departmentIds.includes(card.departmentId))
    || scope.personIds.includes(card.personId)
}

// 編集・削除は登録者本人と admin のみ。閲覧許可だけでは編集できない
export function canEdit(viewer: Viewer, card: Pick<CardRef, 'createdBy'>): boolean {
  return viewer.role === 'admin' || card.createdBy === viewer.id
}

// canView と同じ条件の SQL。undefined は「全件」
export function scopeWhere(scope: AccessScope): SQL | undefined {
  if (scope.all) return undefined
  const conds: SQL[] = [eq(cards.createdBy, scope.userId)]
  if (scope.companyIds.length) conds.push(inArray(cards.companyId, scope.companyIds))
  if (scope.departmentIds.length) conds.push(inArray(cards.departmentId, scope.departmentIds))
  if (scope.personIds.length) conds.push(inArray(cards.personId, scope.personIds))
  return or(...conds)
}
