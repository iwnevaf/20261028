#!/usr/bin/env node
// 起動中のアプリに対して、必須機能（ログイン・利用者追加・名刺登録・検索・閲覧権限・画面）を
// HTTP 経由で通しで確認する。データはすべて架空で、実行ごとに一意な接尾辞を付けるので同じ DB で再実行できる。
//
// 使い方:
//   node scripts/verify-e2e.mjs [--base http://localhost:3000]
//   （サーバーを再起動したあと）node scripts/verify-e2e.mjs --check-persist [--base ...]
//
// admin の認証情報は .env の NUXT_INITIAL_ADMIN_EMAIL / NUXT_INITIAL_ADMIN_PASSWORD から読む。
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)
const argValue = (name) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}
const BASE = (argValue('--base') ?? 'http://localhost:3000').replace(/\/$/, '')
const CHECK_PERSIST = args.includes('--check-persist')
const STATE_FILE = join(tmpdir(), 'meishi-verify-e2e.json')

const envPath = join(dirname(fileURLToPath(import.meta.url)), '..', '.env')
if (existsSync(envPath)) process.loadEnvFile(envPath)
const ADMIN_EMAIL = process.env.NUXT_INITIAL_ADMIN_EMAIL
const ADMIN_PASSWORD = process.env.NUXT_INITIAL_ADMIN_PASSWORD
if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error('.env に NUXT_INITIAL_ADMIN_EMAIL / NUXT_INITIAL_ADMIN_PASSWORD を設定してください')
  process.exit(2)
}

// ---------- 結果の記録 ----------
const results = []
let section = ''
function group(name) {
  section = name
  console.log(`\n## ${name}`)
}
function check(name, ok, detail = '') {
  results.push({ section, name, ok: !!ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail ? `  (${detail})` : ''}`)
  return !!ok
}
function info(message) {
  console.log(`INFO  ${message}`)
}

// ---------- Cookie を保持する簡易 HTTP クライアント ----------
class Client {
  constructor(label) {
    this.label = label
    this.cookies = new Map()
  }

  async req(method, path, { json, form, redirect = 'follow' } = {}) {
    const headers = {}
    if (this.cookies.size) headers.cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ')
    let body
    if (json !== undefined) {
      headers['content-type'] = 'application/json'
      body = JSON.stringify(json)
    }
    else if (form) {
      body = form
    }
    const res = await fetch(BASE + path, { method, headers, body, redirect })
    for (const c of res.headers.getSetCookie()) {
      const [pair, ...attrs] = c.split(';')
      const eq = pair.indexOf('=')
      const name = pair.slice(0, eq).trim()
      const value = pair.slice(eq + 1).trim()
      const expired = !value || attrs.some(a => /^\s*max-age=0\s*$/i.test(a))
      if (expired) this.cookies.delete(name)
      else this.cookies.set(name, value)
    }
    const type = res.headers.get('content-type') ?? ''
    const buf = Buffer.from(await res.arrayBuffer())
    let data = buf
    if (type.includes('json')) data = JSON.parse(buf.toString('utf8') || 'null')
    else if (type.startsWith('text/')) data = buf.toString('utf8')
    return { status: res.status, data, type, location: res.headers.get('location') ?? '' }
  }

  get(path, opts) { return this.req('GET', path, opts) }
  post(path, json) { return this.req('POST', path, { json }) }
  del(path) { return this.req('DELETE', path) }

  async login(email, password) {
    return this.post('/api/auth/login', { email, password })
  }
}

// ---------- テスト用画像（マジックバイトのみ正しい最小限のデータ） ----------
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')
const WEBP = Buffer.from('UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==', 'base64')
const JPEG = Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10]), Buffer.from('JFIF\0'), Buffer.alloc(32), Buffer.from([0xFF, 0xD9])])
const GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64')
const TEXT = Buffer.from('これは画像ではありません\n', 'utf8')

function cardForm(fields, image, fileName, mime) {
  const fd = new FormData()
  if (image) fd.append('image', new Blob([image], { type: mime }), fileName)
  for (const [k, v] of Object.entries(fields)) fd.append(k, v)
  return fd
}

async function registerCard(client, fields, image = PNG, fileName = 'card.png', mime = 'image/png') {
  return client.req('POST', '/api/cards', { form: cardForm(fields, image, fileName, mime) })
}

const ids = list => (Array.isArray(list) ? list.map(c => c.id) : [])

// ---------- 永続化の確認（再起動後に実行） ----------
async function checkPersist() {
  group('永続化（サーバー再起動後）')
  if (!existsSync(STATE_FILE)) {
    check('前回実行の記録ファイルがある', false, STATE_FILE)
    return
  }
  const state = JSON.parse(readFileSync(STATE_FILE, 'utf8'))
  info(`記録ファイル: ${STATE_FILE}（作成: ${state.createdAt}）`)

  const admin = new Client('admin')
  check('admin で再ログインできる', (await admin.login(ADMIN_EMAIL, ADMIN_PASSWORD)).status === 200)
  for (const c of state.cards) {
    const d = await admin.get(`/api/cards/${c.id}`)
    check(`名刺 #${c.id} の情報が保持されている`, d.status === 200 && d.data.name === c.name && d.data.createdByEmail === c.createdByEmail, `status=${d.status}`)
    const img = await admin.get(`/api/cards/${c.id}/image`)
    check(`名刺 #${c.id} の元画像が保持されている`, img.status === 200 && img.type === c.mime && img.data.length === c.size, `status=${img.status}`)
  }

  const users = await admin.get('/api/admin/users')
  for (const u of state.users) {
    const found = Array.isArray(users.data) && users.data.find(x => x.email === u.email)
    check(`利用者 ${u.email} と role=user が保持されている`, found && found.role === 'user')
    const c = new Client(u.email)
    check(`利用者 ${u.email} でログインできる`, (await c.login(u.email, u.password)).status === 200)
  }

  const g = await admin.get(`/api/admin/users/${state.grant.userId}/grants`)
  check('閲覧許可が保持されている', g.status === 200 && g.data.grants.some(x => x.id === state.grant.id))
  const viewer = new Client('viewer')
  await viewer.login(state.grant.email, state.grant.password)
  const list = await viewer.get('/api/cards')
  check('保持された許可で名刺が見える', state.grant.visibleCardIds.every(id => ids(list.data).includes(id)))
  check('許可外の名刺は再起動後も見えない', state.grant.hiddenCardIds.every(id => !ids(list.data).includes(id)))
}

// ---------- 通しの確認 ----------
async function main() {
  const S = randomBytes(3).toString('hex')
  info(`接続先: ${BASE} / 実行ID: ${S}`)
  const mail = local => `${local}-${S}@example.test`
  const PW = `Test-${S}-pass`

  // ===== ログイン・ログアウト =====
  group('ログイン・ログアウト')
  const anon = new Client('anon')
  let r = await anon.login(mail('nobody'), PW)
  check('未登録メールアドレスではログインできない（401）', r.status === 401, `status=${r.status}`)
  r = await anon.login(ADMIN_EMAIL, `${ADMIN_PASSWORD}-wrong`)
  check('誤ったパスワードではログインできない（401）', r.status === 401, `status=${r.status}`)

  const admin = new Client('admin')
  r = await admin.login(ADMIN_EMAIL, ADMIN_PASSWORD)
  check('初期 admin でログインできる', r.status === 200 && r.data.role === 'admin', `status=${r.status}`)
  r = await admin.get('/api/auth/me')
  check('ログイン中は /api/auth/me で本人が返る', r.status === 200 && r.data.role === 'admin')

  const tmp = new Client('tmp')
  await tmp.login(ADMIN_EMAIL, ADMIN_PASSWORD)
  const stolen = new Map(tmp.cookies)
  r = await tmp.post('/api/auth/logout', {})
  check('ログアウトできる', r.status === 200)
  r = await tmp.get('/api/auth/me')
  check('ログアウト後は /api/auth/me が 401', r.status === 401, `status=${r.status}`)
  r = await tmp.get('/api/cards')
  check('ログアウト後は名刺一覧 API が 401', r.status === 401, `status=${r.status}`)
  const replay = new Client('replay')
  replay.cookies = stolen
  r = await replay.get('/api/auth/me')
  check('ログアウト前に控えた Cookie を再送しても 401（サーバー側で失効）', r.status === 401, `status=${r.status}`)
  // ログアウトは同じ利用者の全セッションを失効させるため、admin は再ログインする
  r = await admin.get('/api/auth/me')
  check('ログアウトで同じ利用者の他のセッションも失効する', r.status === 401, `status=${r.status}`)
  await admin.login(ADMIN_EMAIL, ADMIN_PASSWORD)

  // ===== 利用者の追加 =====
  group('利用者の追加（admin のみ）')
  const alice = { email: mail('alice'), password: PW, name: 'テスト登録者A' }
  const bob = { email: mail('bob'), password: PW, name: 'テスト閲覧者B' }
  r = await admin.post('/api/admin/users', alice)
  check('admin が利用者を追加できる', r.status === 200 && r.data.email === alice.email && r.data.role === 'user', `status=${r.status}`)
  alice.id = r.data?.id
  r = await admin.post('/api/admin/users', { ...bob, role: 'admin' })
  check('role=admin を送っても role は user になる', r.status === 200 && r.data.role === 'user', `status=${r.status} role=${r.data?.role}`)
  bob.id = r.data?.id
  r = await admin.post('/api/admin/users', { ...alice })
  check('重複メールアドレスは 409', r.status === 409, `status=${r.status}`)
  r = await admin.post('/api/admin/users', { ...alice, email: alice.email.toUpperCase() })
  check('大文字違いの重複メールアドレスも 409', r.status === 409, `status=${r.status}`)
  r = await admin.post('/api/admin/users', { email: 'not-an-email', password: PW })
  check('不正なメールアドレスは 400', r.status === 400, `status=${r.status}`)
  r = await admin.post('/api/admin/users', { email: mail('short'), password: 'short' })
  check('8文字未満のパスワードは 400', r.status === 400, `status=${r.status}`)

  const ua = new Client('alice')
  const ub = new Client('bob')
  r = await ua.login(alice.email, alice.password)
  check('追加した利用者でログインできる', r.status === 200 && r.data.role === 'user')
  r = await ub.login(bob.email, bob.password)
  check('role を偽装して追加された利用者も user としてログインする', r.status === 200 && r.data.role === 'user')
  r = await ua.post('/api/admin/users', { email: mail('carol'), password: PW })
  check('user は利用者追加 API で 403', r.status === 403, `status=${r.status}`)
  r = await ua.get('/api/admin/users')
  check('user は利用者一覧 API で 403', r.status === 403, `status=${r.status}`)
  r = await anon.post('/api/admin/users', { email: mail('dave'), password: PW })
  check('未ログインは利用者追加 API で 401', r.status === 401, `status=${r.status}`)

  // ===== 名刺登録・画像形式 =====
  group('名刺登録・画像形式')
  const co1 = `架空商事${S}`
  const co2 = `仮想工業${S}`
  const co3 = `見本物産${S}`
  const created = {}
  async function reg(key, client, fields, image, fileName, mime) {
    const res = await registerCard(client, fields, image, fileName, mime)
    if (res.status === 200 && res.data?.id) created[key] = { id: res.data.id, name: fields.name, mime, size: image.length }
    return res
  }

  r = await reg('taro', ua, {
    name: `テスト太郎${S}`, companyName: co1, department: '営業部', title: '課長',
    email: mail('taro'), phone: '000-0000-0000', address: '〒000-0000 架空県架空市1-2-3', website: 'https://example.test',
  }, PNG, 'taro.png', 'image/png')
  check('PNG を登録できる', r.status === 200 && created.taro, `status=${r.status}`)
  r = await reg('hanako1', ua, { name: `同名花子${S}`, companyName: co2, department: '営業部', email: mail('hanako1') }, JPEG, 'hanako1.jpg', 'image/jpeg')
  check('JPEG を登録できる', r.status === 200 && created.hanako1, `status=${r.status}`)
  r = await reg('hanako2', ua, { name: `同名花子${S}`, companyName: co2, department: '開発部', email: mail('hanako2') }, WEBP, 'hanako2.webp', 'image/webp')
  check('WebP を登録できる', r.status === 200 && created.hanako2, `status=${r.status}`)
  r = await reg('onlyName', ua, { name: `氏名のみ三郎${S}` }, PNG, 'only.png', 'image/png')
  check('氏名以外が空欄でも登録できる', r.status === 200 && created.onlyName, `status=${r.status}`)
  // 別会社に同名部署（営業部）を作る
  r = await reg('jiro', ua, { name: `見本次郎${S}`, companyName: co3, department: '営業部', email: mail('jiro') }, PNG, 'jiro.png', 'image/png')
  check('別会社の同名部署の名刺を登録できる', r.status === 200 && created.jiro, `status=${r.status}`)
  // 全角・空白の表記揺れは同じ企業・部署に寄せられる
  r = await reg('kana', ua, { name: `表記揺れ四郎${S}`, companyName: ` ${co2.replace('仮想工業', '仮想工業　')} `, department: '営業部 ', email: mail('kana') }, PNG, 'kana.png', 'image/png')
  check('表記揺れのある会社名・部署名でも登録できる', r.status === 200 && created.kana, `status=${r.status}`)

  // 登録者の偽装
  const forge = cardForm({ name: `偽装五郎${S}`, companyName: co1, createdBy: String(bob.id), created_by: String(bob.id) }, PNG, 'forge.png', 'image/png')
  r = await ua.req('POST', '/api/cards', { form: forge })
  if (r.status === 200) created.forge = { id: r.data.id, name: `偽装五郎${S}`, mime: 'image/png', size: PNG.length }
  const forged = created.forge ? await admin.get(`/api/cards/${created.forge.id}`) : { status: 0 }
  check('createdBy を送っても登録者はログイン中の利用者', forged.status === 200 && forged.data.createdBy === alice.id && forged.data.createdByEmail === alice.email,
    `status=${forged.status} createdBy=${forged.data?.createdBy}`)

  r = await registerCard(ua, { name: `形式違反${S}` }, GIF, 'x.gif', 'image/gif')
  check('GIF は拒否される（400）', r.status === 400, `status=${r.status}`)
  r = await registerCard(ua, { name: `形式違反${S}` }, GIF, 'x.png', 'image/png')
  check('拡張子・MIME を PNG に偽装した GIF も拒否される', r.status === 400, `status=${r.status}`)
  r = await registerCard(ua, { name: `形式違反${S}` }, TEXT, 'x.txt', 'text/plain')
  check('テキストファイルは拒否される（400）', r.status === 400, `status=${r.status}`)
  const big = Buffer.concat([PNG, Buffer.alloc(10 * 1024 * 1024 + 1 - PNG.length)])
  r = await registerCard(ua, { name: `サイズ超過${S}` }, big, 'big.png', 'image/png')
  check('10MB を超える画像は拒否される', r.status === 400 || r.status === 413, `status=${r.status}`)
  r = await registerCard(ua, { name: '', companyName: co1 }, PNG, 'noname.png', 'image/png')
  check('氏名が空だと拒否される（400）', r.status === 400, `status=${r.status}`)
  r = await registerCard(ua, { name: '　 ', companyName: co1 }, PNG, 'noname.png', 'image/png')
  check('氏名が空白のみだと拒否される（400）', r.status === 400, `status=${r.status}`)
  r = await registerCard(ua, { name: `画像なし${S}` }, null)
  check('画像なしは拒否される（400）', r.status === 400, `status=${r.status}`)
  r = await registerCard(anon, { name: `未ログイン${S}` }, PNG, 'a.png', 'image/png')
  check('未ログインは名刺登録 API で 401', r.status === 401, `status=${r.status}`)

  const C = Object.fromEntries(Object.entries(created).map(([k, v]) => [k, v.id]))

  // 登録内容と ID（人物・企業・部署）を admin で取得
  const detail = {}
  for (const [k, id] of Object.entries(C)) detail[k] = (await admin.get(`/api/cards/${id}`)).data
  check('登録内容が詳細 API で取得できる', detail.taro?.email === mail('taro') && detail.taro?.address.includes('架空県') && detail.onlyName?.companyName === '')
  check('表記揺れのある会社名・部署名は既存の企業・部署に紐付く',
    detail.kana?.companyId === detail.hanako1?.companyId && detail.kana?.departmentId === detail.hanako1?.departmentId)
  check('同じ会社の別部署は別の部署 ID', detail.hanako1?.departmentId !== detail.hanako2?.departmentId)
  check('別会社の同名部署は別の部署 ID', detail.jiro?.departmentId !== detail.hanako1?.departmentId)
  check('同姓同名でもメールアドレスが違えば別の人物 ID', detail.hanako1?.personId !== detail.hanako2?.personId)
  r = await reg('hanako1b', ua, { name: `同名花子${S}`, companyName: co3, email: mail('hanako1').toUpperCase() }, PNG, 'hanako1b.png', 'image/png')
  detail.hanako1b = (await admin.get(`/api/cards/${created.hanako1b?.id}`)).data
  C.hanako1b = created.hanako1b?.id
  check('氏名とメールアドレスが同じなら同じ人物 ID（転職後の名刺など）', detail.hanako1b?.personId === detail.hanako1?.personId)

  // bob 自身の名刺
  r = await reg('bobOwn', ub, { name: `自分登録六郎${S}`, companyName: co1, department: '営業部' }, PNG, 'own.png', 'image/png')
  check('別の user も名刺を登録できる', r.status === 200)
  C.bobOwn = created.bobOwn?.id

  // ===== 一覧・検索 =====
  group('一覧・検索')
  const list = async (client, q) => ids((await client.get(`/api/cards${q ? `?q=${encodeURIComponent(q)}` : ''}`)).data)
  let l = await list(ua, `太郎${S}`)
  check('氏名の部分一致で検索できる（日本語）', l.length === 1 && l[0] === C.taro, JSON.stringify(l))
  l = await list(ua, `花子${S}`)
  check('同姓同名の名刺がすべて検索される', [C.hanako1, C.hanako2, C.hanako1b].every(id => l.includes(id)) && l.length === 3, JSON.stringify(l))
  l = await list(ua, `工業${S}`)
  check('会社名の部分一致で検索できる（日本語）', [C.hanako1, C.hanako2].every(id => l.includes(id)) && !l.includes(C.taro), JSON.stringify(l))
  l = await list(ua, `存在しない${S}`)
  check('該当なしは空の結果', l.length === 0)
  l = await list(ua, '%')
  check('% は文字として扱われワイルドカードにならない', !l.includes(C.taro), JSON.stringify(l))
  l = await list(ub, `太郎${S}`)
  check('検索結果も権限で絞られる（許可なし user には他人の名刺が出ない）', l.length === 0, JSON.stringify(l))
  l = await list(admin, S)
  check('admin は全件閲覧できる（他人が登録した名刺も一覧・検索に出る）', Object.values(C).every(id => l.includes(id)), JSON.stringify(l))
  const ad = await admin.get(`/api/cards/${C.bobOwn}`)
  check('admin は他人の名刺の詳細を取得できる', ad.status === 200)

  // ===== 権限（許可なし） =====
  group('閲覧権限（許可なし）')
  const visible = async client => ids((await client.get('/api/cards')).data)
  let vb = await visible(ub)
  check('許可なし user は自分の名刺のみ一覧に出る', vb.includes(C.bobOwn) && !Object.entries(C).some(([k, id]) => k !== 'bobOwn' && vb.includes(id)), JSON.stringify(vb))
  r = await ub.get(`/api/cards/${C.bobOwn}`)
  check('自分の名刺の詳細は取得できる', r.status === 200)
  r = await ub.get(`/api/cards/${C.taro}`)
  check('他人の名刺の詳細を ID 直指定しても 404', r.status === 404, `status=${r.status}`)
  r = await ub.get(`/api/cards/${C.taro}/image`)
  check('他人の名刺の元画像を ID 直指定しても 404', r.status === 404, `status=${r.status}`)
  r = await ub.get('/api/cards/99999999')
  check('存在しない名刺 ID も同じ 404', r.status === 404, `status=${r.status}`)
  r = await ub.get(`/api/cards/${C.forge}`)
  check('登録者偽装した名刺は偽装先の user に見えない', r.status === 404, `status=${r.status}`)
  r = await ua.get(`/api/cards/${C.taro}/image`)
  check('登録者は元画像を取得できる（Content-Type・内容が一致）', r.status === 200 && r.type === 'image/png' && Buffer.compare(r.data, PNG) === 0, `status=${r.status} type=${r.type}`)
  r = await anon.get('/api/cards')
  check('未ログインは一覧 API で 401', r.status === 401, `status=${r.status}`)
  r = await anon.get(`/api/cards/${C.taro}`)
  check('未ログインは詳細 API で 401', r.status === 401, `status=${r.status}`)
  r = await anon.get(`/api/cards/${C.taro}/image`)
  check('未ログインは画像 API で 401', r.status === 401, `status=${r.status}`)
  const bad = new Client('bad')
  bad.cookies.set('nuxt-session', 'tampered-value')
  r = await bad.get('/api/cards')
  check('不正なセッション Cookie は 401', r.status === 401, `status=${r.status}`)

  // ===== 閲覧許可の管理 API は admin のみ =====
  group('閲覧許可の管理（admin のみ）')
  const targets = (await admin.get('/api/admin/targets')).data
  check('admin は許可対象（企業・部署・人物）を取得できる', Array.isArray(targets?.companies) && Array.isArray(targets?.departments) && Array.isArray(targets?.persons))
  check('許可対象の企業は ID で一覧される', targets.companies.some(c => c.id === detail.taro.companyId && c.name === co1))
  check('許可対象の部署は企業とセットで一覧される', targets.departments.some(d => d.id === detail.jiro.departmentId && d.companyName === co3 && d.name === '営業部'))
  const hp = targets.persons.filter(p => p.name === `同名花子${S}`)
  check('同姓同名の人物は別々の選択肢になり、メールで区別できる', hp.length === 2 && hp.every(p => p.emails.length > 0))

  r = await ub.get('/api/admin/targets')
  check('user は許可対象 API で 403', r.status === 403, `status=${r.status}`)
  r = await ub.post(`/api/admin/users/${bob.id}/grants`, { type: 'company', companyId: detail.taro.companyId })
  check('user は自分に閲覧許可を付与できない（403）', r.status === 403, `status=${r.status}`)
  r = await ub.get(`/api/admin/users/${bob.id}/grants`)
  check('user は閲覧許可の一覧 API で 403', r.status === 403, `status=${r.status}`)

  r = await admin.post(`/api/admin/users/${alice.id}/grants`, { type: 'company', companyId: detail.taro.companyId })
  const aliceGrant = r.data?.id
  check('admin は閲覧許可を付与できる（201）', r.status === 201 && aliceGrant, `status=${r.status}`)
  r = await ub.del(`/api/admin/grants/${aliceGrant}`)
  check('user は閲覧許可の解除 API で 403', r.status === 403, `status=${r.status}`)
  r = await admin.post(`/api/admin/users/${alice.id}/grants`, { type: 'company', companyId: detail.taro.companyId })
  check('同じ許可の重複付与は 409', r.status === 409, `status=${r.status}`)
  r = await admin.post(`/api/admin/users/${alice.id}/grants`, { type: 'company', companyId: 99999999 })
  check('存在しない企業 ID への許可は 400', r.status === 400, `status=${r.status}`)
  r = await admin.post(`/api/admin/users/${alice.id}/grants`, { type: 'company', name: co1 })
  check('ID ではなく名前で指定した許可は 400', r.status === 400, `status=${r.status}`)
  r = await admin.del(`/api/admin/grants/${aliceGrant}`)
  check('admin は閲覧許可を解除できる', r.status === 200, `status=${r.status}`)
  r = await anon.post(`/api/admin/users/${bob.id}/grants`, { type: 'company', companyId: detail.taro.companyId })
  check('未ログインは許可付与 API で 401', r.status === 401, `status=${r.status}`)

  // ===== 企業・部署・人物の許可 =====
  group('閲覧許可の反映（企業・部署・人物）')
  const grant = async body => (await admin.post(`/api/admin/users/${bob.id}/grants`, body)).data?.id
  const revoke = async id => (await admin.del(`/api/admin/grants/${id}`)).status
  const sees = async (key) => {
    const [lst, det, img] = await Promise.all([visible(ub), ub.get(`/api/cards/${C[key]}`), ub.get(`/api/cards/${C[key]}/image`)])
    const inList = lst.includes(C[key])
    // 一覧・詳細・画像の結果が揃っていることも確認する
    const consistent = inList === (det.status === 200) && inList === (img.status === 200)
    return consistent ? inList : 'inconsistent'
  }

  // 企業の許可
  const gCompany = await grant({ type: 'company', companyId: detail.taro.companyId })
  check('企業の許可を付与できる', !!gCompany)
  check('企業許可: その企業の名刺が見える（一覧・詳細・画像）', await sees('taro') === true && await sees('forge') === true)
  check('企業許可: 他社の名刺は見えない', await sees('hanako1') === false && await sees('jiro') === false)
  l = await list(ub, `太郎${S}`)
  check('企業許可: 許可された名刺が検索結果に出る', l.includes(C.taro))
  check('企業許可を解除する', await revoke(gCompany) === 200)
  check('企業許可の解除後は見えなくなる', await sees('taro') === false)
  check('自分の登録分は許可解除後も見える', await sees('bobOwn') === true)

  // 部署の許可（仮想工業 › 営業部）
  const gDept = await grant({ type: 'department', departmentId: detail.hanako1.departmentId })
  check('部署の許可を付与できる', !!gDept)
  check('部署許可: 同じ会社の同じ部署の名刺が見える（表記揺れで登録した名刺も含む）', await sees('hanako1') === true && await sees('kana') === true)
  check('部署許可: 同じ会社の別部署は見えない', await sees('hanako2') === false)
  check('部署許可: 別会社の同名部署（営業部）は見えない', await sees('jiro') === false && await sees('taro') === false)

  // 人物の許可（同名花子 / hanako1）
  const gPerson = await grant({ type: 'person', personId: detail.hanako1.personId })
  check('人物の許可を付与できる', !!gPerson)
  check('人物許可: 同じ人物（氏名+メール一致）の別会社の名刺も見える', await sees('hanako1b') === true)
  check('人物許可: 同姓同名の別人（別メール）は見えない', await sees('hanako2') === false)

  check('部署許可を解除する', await revoke(gDept) === 200)
  check('別の許可（人物）が残っていれば解除後も見える', await sees('hanako1') === true)
  check('部署許可の解除で、その部署だけで見えていた名刺は見えなくなる', await sees('kana') === false)
  check('人物許可を解除する', await revoke(gPerson) === 200)
  check('すべての許可を解除すると見えなくなる', await sees('hanako1') === false && await sees('hanako1b') === false)
  vb = await visible(ub)
  check('許可をすべて解除すると自分の名刺のみに戻る', vb.length === 1 && vb[0] === C.bobOwn, JSON.stringify(vb))
  r = await admin.del(`/api/admin/grants/${gPerson}`)
  check('解除済みの許可をもう一度解除すると 404', r.status === 404, `status=${r.status}`)

  // ===== 画面（SSR） =====
  group('画面（SSR）')
  const page = async (client, path) => client.get(path, { redirect: 'manual' })
  const redirectsTo = (res, to) => res.status >= 300 && res.status < 400 && new URL(res.location, BASE).pathname === to
  r = await page(anon, '/login')
  check('/login が表示される', r.status === 200 && r.data.includes('名刺管理 ログイン'), `status=${r.status}`)
  for (const path of ['/', '/cards/new', `/cards/${C.taro}`, '/admin/users', `/admin/users/${bob.id}`]) {
    r = await page(anon, path)
    check(`未ログインで ${path} は /login へリダイレクト`, redirectsTo(r, '/login'), `status=${r.status} location=${r.location}`)
  }
  r = await page(admin, '/login')
  check('ログイン中に /login を開くと / へリダイレクト', redirectsTo(r, '/'), `status=${r.status} location=${r.location}`)
  r = await page(admin, '/')
  check('/ に「名刺一覧」が表示される', r.status === 200 && r.data.includes('名刺一覧'), `status=${r.status}`)
  r = await page(admin, `/?q=${encodeURIComponent(`太郎${S}`)}`)
  check('/?q= で検索結果が表示される', r.status === 200 && r.data.includes(`テスト太郎${S}`), `status=${r.status}`)
  r = await page(admin, '/cards/new')
  check('/cards/new に「名刺を登録」が表示される', r.status === 200 && r.data.includes('名刺を登録'), `status=${r.status}`)
  r = await page(admin, `/cards/${C.taro}`)
  check('/cards/:id に氏名・連絡先・元画像が表示される', r.status === 200 && r.data.includes(`テスト太郎${S}`) && r.data.includes(mail('taro')) && r.data.includes(`/api/cards/${C.taro}/image`), `status=${r.status}`)
  r = await page(admin, '/admin/users')
  check('/admin/users に利用者の追加・一覧が表示される', r.status === 200 && r.data.includes('利用者の追加') && r.data.includes(bob.email), `status=${r.status}`)
  r = await page(admin, `/admin/users/${bob.id}`)
  check('/admin/users/:id に閲覧許可画面が表示される', r.status === 200 && r.data.includes(`閲覧許可: ${bob.email}`) && r.data.includes('許可の追加'), `status=${r.status}`)
  r = await page(ub, '/admin/users')
  check('user が /admin/users を開くと / へリダイレクト', redirectsTo(r, '/'), `status=${r.status} location=${r.location}`)
  r = await page(ub, `/cards/${C.taro}`)
  check('user が権限のない /cards/:id を開くと内容を出さず案内を表示', r.status === 200 && r.data.includes('閲覧権限がありません') && !r.data.includes(mail('taro')), `status=${r.status}`)
  r = await page(ub, '/')
  check('user の / には自分の名刺のみ表示される', r.status === 200 && r.data.includes(`自分登録六郎${S}`) && !r.data.includes(`テスト太郎${S}`), `status=${r.status}`)

  // ===== 永続化確認用の状態を保存 =====
  // bob に仮想工業の企業許可を残し、再起動後も効いているかを --check-persist で確認する
  const gKeep = await grant({ type: 'company', companyId: detail.hanako1.companyId })
  const cards = Object.values(created).map(c => ({ ...c, createdByEmail: c.id === C.bobOwn ? bob.email : alice.email }))
  writeFileSync(STATE_FILE, JSON.stringify({
    createdAt: new Date().toISOString(),
    base: BASE,
    cards,
    users: [alice, bob].map(u => ({ email: u.email, password: u.password })),
    grant: { id: gKeep, userId: bob.id, email: bob.email, password: bob.password, visibleCardIds: [C.hanako1, C.hanako2, C.kana, C.bobOwn], hiddenCardIds: [C.taro, C.jiro] },
  }, null, 2))
  info(`永続化確認用の記録を書き出しました: ${STATE_FILE}`)
  info('サーバーを再起動したあと `node scripts/verify-e2e.mjs --check-persist` を実行してください')

  await accountChecks(admin, { S, mail, PW })
}

// ---------- role 変更・パスワード変更／再設定 ----------
// 初期 admin（.env）の role・パスワードは変更しない。操作対象はすべてここで作る架空の利用者
async function accountChecks(admin, { S, mail, PW }) {
  const anon = new Client('anon')
  const adminMe = (await admin.get('/api/auth/me')).data
  const newUser = async (local, name) => {
    const u = { email: mail(local), password: PW, name }
    u.id = (await admin.post('/api/admin/users', u)).data?.id
    return u
  }
  const setRole = (client, id, role) => client.req('PATCH', `/api/admin/users/${id}/role`, { json: { role } })
  const page = async (client, path) => client.get(path, { redirect: 'manual' })
  const redirectsTo = (res, to) => res.status >= 300 && res.status < 400 && new URL(res.location, BASE).pathname === to

  group('role の変更（admin のみ）')
  const carol = await newUser('carol', 'テスト昇格C')
  const dave = await newUser('dave', 'テスト登録D')
  check('確認用の利用者を2名追加できる', carol.id && dave.id)
  const uc = new Client('carol')
  const ud = new Client('dave')
  await uc.login(carol.email, carol.password)
  await ud.login(dave.email, dave.password)

  // dave が2社分の名刺を登録し、carol には1社分の企業許可だけを付与する
  const coX = `権限確認商事${S}`
  const coY = `権限確認工業${S}`
  const cx = (await registerCard(ud, { name: `許可内七郎${S}`, companyName: coX })).data?.id
  const cy = (await registerCard(ud, { name: `許可外八郎${S}`, companyName: coY })).data?.id
  const companyX = (await admin.get(`/api/cards/${cx}`)).data?.companyId
  const gC = (await admin.post(`/api/admin/users/${carol.id}/grants`, { type: 'company', companyId: companyX })).data?.id
  const seen = async client => ids((await client.get('/api/cards')).data)
  let v = await seen(uc)
  check('昇格前: user の carol は許可された企業の名刺だけ見える', v.includes(cx) && !v.includes(cy), JSON.stringify(v))
  let r = await uc.get('/api/admin/users')
  check('昇格前: carol は admin API で 403', r.status === 403, `status=${r.status}`)

  r = await setRole(ud, carol.id, 'admin')
  check('user は他人の role を変更できない（403）', r.status === 403, `status=${r.status}`)
  r = await setRole(ud, dave.id, 'admin')
  check('user は自分の role を変更できない（403）', r.status === 403, `status=${r.status}`)
  r = await setRole(anon, carol.id, 'admin')
  check('未ログインは role 変更 API で 401', r.status === 401, `status=${r.status}`)
  r = await setRole(admin, carol.id, 'superuser')
  check('admin / user 以外の role は 400', r.status === 400, `status=${r.status}`)
  r = await setRole(admin, 99999999, 'admin')
  check('存在しない利用者の role 変更は 404', r.status === 404, `status=${r.status}`)
  r = await setRole(admin, adminMe.id, 'user')
  check('admin は自分の role を変更できない（400）', r.status === 400, `status=${r.status}`)
  r = await admin.get('/api/auth/me')
  check('自分の role 変更の失敗後も admin のまま', r.status === 200 && r.data.role === 'admin')

  r = await setRole(admin, carol.id, 'admin')
  check('admin は user を admin に昇格できる', r.status === 200 && r.data.role === 'admin', `status=${r.status}`)
  r = await uc.get('/api/admin/users')
  check('昇格は即時反映: 昇格前からのセッションで admin API を呼べる', r.status === 200, `status=${r.status}`)
  v = await seen(uc)
  check('昇格後: 許可外の名刺も含め全件見える', v.includes(cx) && v.includes(cy), JSON.stringify(v))
  r = await uc.get(`/api/cards/${cy}`)
  check('昇格後: 許可外の名刺の詳細も取得できる', r.status === 200, `status=${r.status}`)
  r = await uc.get('/api/auth/me')
  check('昇格後: /api/auth/me の role が admin', r.data?.role === 'admin')
  r = await page(uc, '/admin/users')
  check('昇格後: 同じセッションで /admin/users 画面を開ける（Cookie 内の古い role で弾かれない）', r.status === 200 && r.data.includes('利用者の追加'), `status=${r.status} location=${r.location}`)
  r = await admin.get(`/api/admin/users/${carol.id}/grants`)
  check('昇格しても付与済みの閲覧許可は DB に残る', r.status === 200 && r.data.grants.some(g => g.id === gC))

  r = await setRole(admin, carol.id, 'user')
  check('admin は他の admin を user に戻せる', r.status === 200 && r.data.role === 'user', `status=${r.status}`)
  r = await uc.get('/api/admin/users')
  check('降格は即時反映: 同じセッションでも admin API は 403', r.status === 403, `status=${r.status}`)
  r = await uc.get(`/api/cards/${cy}`)
  check('降格後: 許可外の名刺は 404', r.status === 404, `status=${r.status}`)
  v = await seen(uc)
  check('降格後: 残っていた閲覧許可が再び効く', v.includes(cx) && !v.includes(cy), JSON.stringify(v))
  r = await uc.get('/api/auth/me')
  check('降格後: /api/auth/me の role が user', r.data?.role === 'user')
  r = await page(uc, '/admin/users')
  check('降格後: 同じセッションで /admin/users を開くと / へリダイレクト', redirectsTo(r, '/'), `status=${r.status} location=${r.location}`)

  // 最後の admin の降格: API を呼べるのは admin だけなので、admin が1人なら対象は必ず呼び出し元自身になり、
  // 上の「自分の role は変更できない（400）」で拒否される。同時操作で0人になるケースはトランザクション内の
  // admin 数の確認で防いでおり、HTTP からは決定的に再現できないため判定ロジックを tests/account.test.ts で確認する
  const admins = ((await admin.get('/api/admin/users')).data ?? []).filter(u => u.role === 'admin')
  check('role 変更の確認後も admin が1人以上いる', admins.some(u => u.id === adminMe.id))
  info(`現在の admin は ${admins.length} 人。最後の admin を降格できない判定はユニットテストで確認`)

  group('パスワード変更（本人）')
  const uc2 = new Client('carol-2')
  await uc2.login(carol.email, carol.password)
  const changePw = (client, currentPassword, newPassword) => client.post('/api/auth/password', { currentPassword, newPassword })
  const PW2 = `${PW}-new`
  r = await changePw(uc, `${carol.password}-wrong`, PW2)
  check('現在のパスワードが誤っていると 400（日本語メッセージ）', r.status === 400 && /パスワード/.test(r.data?.statusMessage ?? ''), `status=${r.status}`)
  r = await changePw(uc, carol.password, 'short')
  check('8文字未満の新しいパスワードは 400', r.status === 400, `status=${r.status}`)
  r = await changePw(uc, carol.password, carol.password)
  check('現在と同じパスワードへの変更は 400', r.status === 400, `status=${r.status}`)
  r = await changePw(anon, carol.password, PW2)
  check('未ログインはパスワード変更 API で 401', r.status === 401, `status=${r.status}`)
  r = await uc2.get('/api/auth/me')
  check('失敗した変更では他のセッションは失効しない', r.status === 200, `status=${r.status}`)

  r = await changePw(uc, carol.password, PW2)
  check('パスワードを変更できる', r.status === 200, `status=${r.status}`)
  r = await uc.get('/api/auth/me')
  check('変更したセッションはログインしたまま', r.status === 200 && r.data.id === carol.id, `status=${r.status}`)
  r = await uc.get('/api/cards')
  check('変更したセッションで引き続き API を呼べる', r.status === 200, `status=${r.status}`)
  r = await uc2.get('/api/auth/me')
  check('同じ利用者の他のセッションは 401', r.status === 401, `status=${r.status}`)
  r = await new Client('carol-old').login(carol.email, carol.password)
  check('古いパスワードではログインできない', r.status === 401, `status=${r.status}`)
  r = await new Client('carol-new').login(carol.email, PW2)
  check('新しいパスワードでログインできる', r.status === 200, `status=${r.status}`)
  carol.password = PW2

  group('パスワード再設定（admin による他の利用者）')
  const ud2 = new Client('dave-2')
  await ud2.login(dave.email, dave.password)
  const resetPw = (client, id, newPassword) => client.post(`/api/admin/users/${id}/password`, { newPassword })
  const PW3 = `${PW}-reset`
  r = await resetPw(ud, carol.id, PW3)
  check('user は他人のパスワードを再設定できない（403）', r.status === 403, `status=${r.status}`)
  r = await resetPw(anon, dave.id, PW3)
  check('未ログインはパスワード再設定 API で 401', r.status === 401, `status=${r.status}`)
  // 自分への再設定は拒否される。万一通っても admin のパスワードが変わらないよう8文字未満を送る
  r = await resetPw(admin, adminMe.id, 'x')
  check('admin は自分のパスワードを再設定 API で変更できない（400）', r.status === 400 && /アカウント設定/.test(r.data?.statusMessage ?? ''), `status=${r.status}`)
  r = await resetPw(admin, dave.id, 'short')
  check('8文字未満の再設定パスワードは 400', r.status === 400, `status=${r.status}`)
  r = await resetPw(admin, 99999999, PW3)
  check('存在しない利用者の再設定は 404', r.status === 404, `status=${r.status}`)
  r = await ud.get('/api/auth/me')
  check('失敗した再設定では対象のセッションは失効しない', r.status === 200, `status=${r.status}`)

  r = await resetPw(admin, dave.id, PW3)
  check('admin は他の利用者のパスワードを再設定できる', r.status === 200, `status=${r.status}`)
  r = await ud.get('/api/auth/me')
  const r2 = await ud2.get('/api/cards')
  check('再設定で対象の既存セッションはすべて 401', r.status === 401 && r2.status === 401, `status=${r.status}/${r2.status}`)
  r = await new Client('dave-old').login(dave.email, dave.password)
  check('再設定後は古いパスワードでログインできない', r.status === 401, `status=${r.status}`)
  r = await new Client('dave-new').login(dave.email, PW3)
  check('再設定したパスワードでログインできる', r.status === 200 && r.data.role === 'user', `status=${r.status}`)
  r = await admin.get('/api/auth/me')
  check('再設定した admin 自身のセッションは影響を受けない', r.status === 200, `status=${r.status}`)

  r = await page(uc, '/account')
  check('/account にアカウント設定（パスワード変更）が表示される', r.status === 200 && r.data.includes('アカウント設定') && r.data.includes('現在のパスワード'), `status=${r.status}`)
  r = await page(anon, '/account')
  check('未ログインで /account は /login へリダイレクト', redirectsTo(r, '/login'), `status=${r.status} location=${r.location}`)
}

try {
  if (CHECK_PERSIST) await checkPersist()
  else await main()
}
catch (e) {
  check('スクリプトが最後まで実行できる', false, e?.cause?.code ?? e?.message ?? String(e))
}

const failed = results.filter(r => !r.ok)
console.log(`\n結果: ${results.length} 件中 PASS ${results.length - failed.length} / FAIL ${failed.length}`)
for (const f of failed) console.log(`  FAIL [${f.section}] ${f.name}`)
process.exit(failed.length ? 1 : 0)
