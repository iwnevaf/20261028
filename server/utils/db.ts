import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import * as schema from '../db/schema'

let _db: BetterSQLite3Database<typeof schema> | undefined

export function useDb() {
  if (!_db) {
    const path = useRuntimeConfig().databasePath
    mkdirSync(dirname(path), { recursive: true })
    const sqlite = new Database(path)
    sqlite.pragma('journal_mode = WAL')
    sqlite.pragma('foreign_keys = ON')
    _db = drizzle(sqlite, { schema })
  }
  return _db
}

export { schema }
