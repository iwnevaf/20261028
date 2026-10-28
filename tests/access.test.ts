import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { asc } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { accessScope, canView, scopeWhere, type CardRef, type Grant, type Viewer } from '../server/lib/access'
import * as schema from '../server/db/schema'

// すべて架空のデータ
// 利用者: 1=admin, 2=user（閲覧者）, 3=user（他の登録者）
// 企業: 1=架空商事, 2=サンプル工業
// 部署: 1=架空商事/営業部, 2=サンプル工業/営業部（同名部署・別企業）
// 人物: 1=架空 一郎（メールあり）, 2=架空 一郎（同姓同名の別人）, 3=見本 花子, 4=例示 次郎
const admin: Viewer = { id: 1, role: 'admin' }
const viewer: Viewer = { id: 2, role: 'user' }

const cardRefs: Record<string, CardRef> = {
  companyA_salesA_person1: { createdBy: 3, companyId: 1, departmentId: 1, personId: 1 },
  companyB_salesB_person2: { createdBy: 3, companyId: 2, departmentId: 2, personId: 2 },
  ownCard_companyB_person3: { createdBy: 2, companyId: 2, departmentId: null, personId: 3 },
  noCompany_person4: { createdBy: 3, companyId: null, departmentId: null, personId: 4 },
}
const allKeys = Object.keys(cardRefs)

const grant = (type: Grant['type'], id: number): Grant => ({
  type,
  companyId: type === 'company' ? id : type === 'department' ? (id === 1 ? 1 : 2) : null,
  departmentId: type === 'department' ? id : null,
  personId: type === 'person' ? id : null,
})

const visible = (v: Viewer, grants: Grant[]) => {
  const scope = accessScope(v, grants)
  return allKeys.filter(k => canView(scope, cardRefs[k]!))
}

describe('accessScope / canView', () => {
  it('admin は全名刺を閲覧できる', () => {
    expect(visible(admin, [])).toEqual(allKeys)
  })

  it('許可なしの user は自分が登録した名刺のみ', () => {
    expect(visible(viewer, [])).toEqual(['ownCard_companyB_person3'])
  })

  it('他の user の登録名刺は見えない（登録者本人には見える）', () => {
    expect(visible({ id: 3, role: 'user' }, [])).toEqual(['companyA_salesA_person1', 'companyB_salesB_person2', 'noCompany_person4'])
  })

  it('企業の許可でその企業の全名刺を閲覧できる', () => {
    expect(visible(viewer, [grant('company', 1)])).toEqual(['companyA_salesA_person1', 'ownCard_companyB_person3'])
  })

  it('部署の許可は他社の同名部署（別 departmentId）に広がらない', () => {
    const v = visible(viewer, [grant('department', 1)])
    expect(v).toContain('companyA_salesA_person1')
    expect(v).not.toContain('companyB_salesB_person2')
  })

  it('人物の許可は同姓同名の別人（別 personId）に広がらない', () => {
    const v = visible(viewer, [grant('person', 1)])
    expect(v).toContain('companyA_salesA_person1')
    expect(v).not.toContain('companyB_salesB_person2')
  })

  it('いずれか1つの許可を満たせば閲覧できる', () => {
    expect(visible(viewer, [grant('person', 4), grant('department', 1)]))
      .toEqual(['companyA_salesA_person1', 'ownCard_companyB_person3', 'noCompany_person4'])
  })

  it('1つの許可を解除しても、別の許可が残っていれば閲覧できる', () => {
    const before = [grant('company', 1), grant('person', 1)]
    const after = before.filter(g => g.type !== 'company')
    expect(visible(viewer, before)).toContain('companyA_salesA_person1')
    expect(visible(viewer, after)).toContain('companyA_salesA_person1')
    // すべて解除すると見えなくなる
    expect(visible(viewer, [])).not.toContain('companyA_salesA_person1')
  })

  it('許可を解除しても登録者本人の閲覧権限は残る', () => {
    expect(visible(viewer, [grant('company', 2)])).toContain('ownCard_companyB_person3')
    expect(visible(viewer, [])).toContain('ownCard_companyB_person3')
  })

  it('ID が null の不正な許可は無視される', () => {
    const broken: Grant = { type: 'company', companyId: null, departmentId: null, personId: null }
    expect(visible(viewer, [broken])).toEqual(['ownCard_companyB_person3'])
  })
})

describe('scopeWhere', () => {
  it('admin は undefined（全件）', () => {
    expect(scopeWhere(accessScope(admin, []))).toBeUndefined()
  })

  it('user は SQL 条件を返す', () => {
    const where = scopeWhere(accessScope(viewer, [grant('company', 1)]))
    expect(where).toBeDefined()
    expect(typeof where).toBe('object')
  })
})

describe('scopeWhere を実際の SQLite に適用すると canView と同じ結果になる', () => {
  const sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')
  const db = drizzle(sqlite, { schema })

  beforeAll(() => {
    migrate(db, { migrationsFolder: fileURLToPath(new URL('../server/db/migrations', import.meta.url)) })
    db.insert(schema.users).values([
      { id: 1, email: 'admin@example.com', passwordHash: 'x', role: 'admin' },
      { id: 2, email: 'user2@example.com', passwordHash: 'x', role: 'user' },
      { id: 3, email: 'user3@example.com', passwordHash: 'x', role: 'user' },
    ]).run()
    db.insert(schema.companies).values([
      { id: 1, name: '架空商事', normalizedName: '架空商事' },
      { id: 2, name: 'サンプル工業', normalizedName: 'サンプル工業' },
    ]).run()
    db.insert(schema.departments).values([
      { id: 1, companyId: 1, name: '営業部', normalizedName: '営業部' },
      { id: 2, companyId: 2, name: '営業部', normalizedName: '営業部' },
    ]).run()
    db.insert(schema.persons).values([
      { id: 1, name: '架空 一郎', normalizedName: '架空一郎', normalizedEmail: 'ichiro@example.com' },
      { id: 2, name: '架空 一郎', normalizedName: '架空一郎', normalizedEmail: null },
      { id: 3, name: '見本 花子', normalizedName: '見本花子', normalizedEmail: null },
      { id: 4, name: '例示 次郎', normalizedName: '例示次郎', normalizedEmail: null },
    ]).run()
    for (const key of allKeys) {
      const ref = cardRefs[key]!
      db.insert(schema.cards).values({
        ...ref,
        name: key,
        imagePath: `${key}.png`,
        imageMime: 'image/png',
      }).run()
    }
  })

  afterAll(() => sqlite.close())

  const query = (v: Viewer, grants: Grant[]) =>
    db.select({ name: schema.cards.name }).from(schema.cards)
      .where(scopeWhere(accessScope(v, grants)))
      .orderBy(asc(schema.cards.id)).all().map(r => r.name)

  const cases: [string, Viewer, Grant[]][] = [
    ['admin', admin, []],
    ['許可なし', viewer, []],
    ['企業許可', viewer, [grant('company', 1)]],
    ['部署許可', viewer, [grant('department', 1)]],
    ['他社の同名部署の許可', viewer, [grant('department', 2)]],
    ['人物許可', viewer, [grant('person', 1)]],
    ['同姓同名の別人の許可', viewer, [grant('person', 2)]],
    ['複数許可', viewer, [grant('company', 2), grant('person', 4), grant('department', 1)]],
  ]

  it.each(cases)('%s', (_label, v, grants) => {
    expect(query(v, grants)).toEqual(visible(v, grants))
  })

  it('部署許可の SQL は他社の同名部署を返さない', () => {
    expect(query(viewer, [grant('department', 1)])).toEqual(['companyA_salesA_person1', 'ownCard_companyB_person3'])
  })

  it('人物許可の SQL は同姓同名の別人を返さない', () => {
    expect(query(viewer, [grant('person', 1)])).toEqual(['companyA_salesA_person1', 'ownCard_companyB_person3'])
  })
})
