import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const card = await requireVisibleCard(event)
  const creator = useDb().select({ email: schema.users.email, name: schema.users.name })
    .from(schema.users).where(eq(schema.users.id, card.createdBy)).get()
  const { imagePath: _p, ...rest } = card
  return { ...rest, createdByEmail: creator?.email ?? '', createdByName: creator?.name ?? '' }
})
