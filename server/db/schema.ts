import { sqliteTable, text, integer, uniqueIndex, index } from 'drizzle-orm/sqlite-core'

const createdAt = () =>
  integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date())

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull().unique(),
  name: text('name').notNull().default(''),
  passwordHash: text('password_hash').notNull(),
  role: text('role', { enum: ['admin', 'user'] }).notNull().default('user'),
  createdAt: createdAt(),
})

// 企業・部署は正規化名で一意にし、閲覧許可は文字列ではなく ID で参照する
export const companies = sqliteTable('companies', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  normalizedName: text('normalized_name').notNull().unique(),
})

export const departments = sqliteTable('departments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  companyId: integer('company_id').notNull().references(() => companies.id),
  name: text('name').notNull(),
  normalizedName: text('normalized_name').notNull(),
}, t => [uniqueIndex('departments_company_name').on(t.companyId, t.normalizedName)])

// 名刺に記載された相手。氏名+メールアドレスが一致する場合のみ同一人物とみなす
export const persons = sqliteTable('persons', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  normalizedName: text('normalized_name').notNull(),
  normalizedEmail: text('normalized_email'),
}, t => [index('persons_name_email').on(t.normalizedName, t.normalizedEmail)])

export const cards = sqliteTable('cards', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  personId: integer('person_id').notNull().references(() => persons.id),
  companyId: integer('company_id').references(() => companies.id),
  departmentId: integer('department_id').references(() => departments.id),
  name: text('name').notNull(),
  companyName: text('company_name').notNull().default(''),
  department: text('department').notNull().default(''),
  title: text('title').notNull().default(''),
  email: text('email').notNull().default(''),
  phone: text('phone').notNull().default(''),
  address: text('address').notNull().default(''),
  website: text('website').notNull().default(''),
  imagePath: text('image_path').notNull(),
  imageMime: text('image_mime').notNull(),
  createdBy: integer('created_by').notNull().references(() => users.id),
  createdAt: createdAt(),
})

export const grants = sqliteTable('grants', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: text('type', { enum: ['company', 'department', 'person'] }).notNull(),
  companyId: integer('company_id').references(() => companies.id),
  departmentId: integer('department_id').references(() => departments.id),
  personId: integer('person_id').references(() => persons.id),
  createdAt: createdAt(),
}, t => [index('grants_user').on(t.userId)])
