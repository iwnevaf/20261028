#!/usr/bin/env node
// 名刺画像の AI 抽出結果を期待結果（expected/*.json）と突き合わせて一致率を出す
//
// 使い方:
//   node scripts/eval-extract.mjs [--base http://localhost:3000] [--images ./images] [--expected ./expected]
//                                 [--show-diff] [--markdown]
//
// - 管理者の認証情報は環境変数 NUXT_INITIAL_ADMIN_EMAIL / NUXT_INITIAL_ADMIN_PASSWORD（.env があれば読み込む）
// - 既定では値を一切表示しない（✓/✗ と集計のみ）。--show-diff は不一致の期待値・実際値を表示する（ローカル確認専用。
//   出力に個人情報が含まれるため README やログに貼らないこと）
// - --markdown は README に貼れる形式（値を含まない）で集計を出力する
// - レポート用途のため終了コードは常に 0

import { readFile, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { basename, extname, join, resolve } from 'node:path'
import { FIELDS, compareCard, percent, summarize } from './eval-compare.mjs'

const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' }

function parseArgs(argv) {
  const opts = { base: 'http://localhost:3000', images: './images', expected: './expected', showDiff: false, markdown: false, env: '.env' }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--show-diff') opts.showDiff = true
    else if (arg === '--markdown') opts.markdown = true
    else if (arg === '--base') opts.base = argv[++i]
    else if (arg === '--images') opts.images = argv[++i]
    else if (arg === '--expected') opts.expected = argv[++i]
    else if (arg === '--env') opts.env = argv[++i]
    else if (arg === '--help' || arg === '-h') opts.help = true
    else console.warn(`不明な引数を無視します: ${arg}`)
  }
  opts.base = opts.base.replace(/\/+$/, '')
  return opts
}

// .env を読み込む（Node 20.12+ の process.loadEnvFile。既に設定済みの環境変数は上書きしない）
function loadEnv(path) {
  if (existsSync(path) && typeof process.loadEnvFile === 'function') process.loadEnvFile(path)
}

async function login(base, email, password) {
  const res = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) throw new Error(`ログイン失敗: ${res.status} ${await errorMessage(res)}`)
  const cookies = res.headers.getSetCookie?.() ?? [res.headers.get('set-cookie')].filter(Boolean)
  const cookie = cookies.map(c => c.split(';')[0]).join('; ')
  if (!cookie) throw new Error('ログイン応答にセッション Cookie がありません')
  return cookie
}

async function errorMessage(res) {
  const text = await res.text().catch(() => '')
  try {
    const body = JSON.parse(text)
    return body.statusMessage || body.message || res.statusText
  }
  catch {
    return res.statusText || text.slice(0, 200)
  }
}

async function extract(base, cookie, file) {
  const buf = await readFile(file)
  const form = new FormData()
  form.append('image', new Blob([buf], { type: MIME[extname(file).toLowerCase()] }), basename(file))
  const res = await fetch(`${base}/api/cards/extract`, { method: 'POST', headers: { cookie }, body: form })
  if (!res.ok) return { error: `${res.status} ${await errorMessage(res)}` }
  return { data: await res.json() }
}

function pad(s, n) {
  // 全角の ✓/✗ を考慮せず単純に揃える（記号は1文字幅で表示される端末を想定）
  return String(s).padEnd(n)
}

function printTable(rows, summary) {
  const head = ['image', ...FIELDS]
  const widths = head.map(h => Math.max(h.length, 8))
  console.log(head.map((h, i) => pad(h, widths[i])).join(' '))
  for (const row of rows) {
    const cells = [row.image, ...FIELDS.map(f => row.result[f].match ? '✓' : (row.result[f].hallucination ? '✗(H)' : '✗'))]
    console.log(cells.map((c, i) => pad(c, widths[i])).join(' ') + (row.failed ? `  [抽出失敗: ${row.error}]` : ''))
  }
  console.log('')
  console.log(`全体の項目一致率: ${summary.match}/${summary.total} (${percent(summary.match, summary.total)})`)
  console.log(`抽出失敗: ${summary.failed}/${summary.images} 枚`)
  console.log(`ハルシネーション（期待が空欄なのに値あり）: ${summary.hallucination} 件`)
  console.log('項目別:')
  for (const f of FIELDS) {
    const p = summary.perField[f]
    console.log(`  ${pad(f, 12)} ${p.match}/${p.total} (${percent(p.match, p.total)})  hallucination=${p.hallucination}`)
  }
}

function printMarkdown(rows, summary) {
  console.log(`| 画像 | ${FIELDS.join(' | ')} |`)
  console.log(`| --- | ${FIELDS.map(() => ':---:').join(' | ')} |`)
  for (const row of rows) {
    const cells = FIELDS.map(f => row.result[f].match ? '✓' : (row.result[f].hallucination ? '✗(H)' : '✗'))
    console.log(`| ${row.image}${row.failed ? '（抽出失敗）' : ''} | ${cells.join(' | ')} |`)
  }
  console.log('')
  console.log('| 項目 | 一致 | 一致率 | ハルシネーション |')
  console.log('| --- | ---: | ---: | ---: |')
  for (const f of FIELDS) {
    const p = summary.perField[f]
    console.log(`| ${f} | ${p.match}/${p.total} | ${percent(p.match, p.total)} | ${p.hallucination} |`)
  }
  console.log(`| **全体** | ${summary.match}/${summary.total} | ${percent(summary.match, summary.total)} | ${summary.hallucination} |`)
  console.log('')
  console.log(`抽出失敗: ${summary.failed}/${summary.images} 枚。✗(H) は期待が空欄なのに値が入った項目（推測による補完）。`)
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  if (opts.help) {
    console.log('node scripts/eval-extract.mjs [--base URL] [--images DIR] [--expected DIR] [--env FILE] [--show-diff] [--markdown]')
    return
  }
  loadEnv(opts.env)
  const email = process.env.NUXT_INITIAL_ADMIN_EMAIL
  const password = process.env.NUXT_INITIAL_ADMIN_PASSWORD
  if (!email || !password) {
    console.error('NUXT_INITIAL_ADMIN_EMAIL / NUXT_INITIAL_ADMIN_PASSWORD が未設定です（.env または環境変数）')
    return
  }

  const imagesDir = resolve(opts.images)
  const expectedDir = resolve(opts.expected)
  let files
  try {
    files = (await readdir(imagesDir)).filter(f => MIME[extname(f).toLowerCase()]).sort()
  }
  catch (e) {
    console.error(`画像ディレクトリを読めません: ${imagesDir} (${e.message})`)
    return
  }

  let cookie
  try {
    cookie = await login(opts.base, email, password)
  }
  catch (e) {
    console.error(e.message)
    return
  }

  const rows = []
  for (const file of files) {
    const stem = basename(file, extname(file))
    const expectedPath = join(expectedDir, `${stem}.json`)
    if (!existsSync(expectedPath)) {
      console.warn(`期待結果がないためスキップ: ${file}`)
      continue
    }
    const expected = JSON.parse(await readFile(expectedPath, 'utf8'))
    let res
    try {
      res = await extract(opts.base, cookie, join(imagesDir, file))
    }
    catch (e) {
      res = { error: e.message }
    }
    if (res.error) console.warn(`${file}: 抽出失敗 ${res.error}`)
    const actual = res.data ?? null
    const row = { image: file, failed: !actual, error: res.error, result: compareCard(expected, actual) }
    rows.push(row)

    if (opts.showDiff && actual) {
      for (const f of FIELDS) {
        if (!row.result[f].match) console.log(`  [diff] ${file} ${f}: expected=${JSON.stringify(expected[f] ?? '')} actual=${JSON.stringify(actual[f] ?? '')}`)
      }
    }
  }

  const summary = summarize(rows)
  console.log('')
  if (opts.markdown) printMarkdown(rows, summary)
  else printTable(rows, summary)
}

main()
  .catch(e => console.error(e))
  .finally(() => { process.exitCode = 0 })
