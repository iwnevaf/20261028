import { eq } from 'drizzle-orm'
import { canEdit } from '../../../lib/access'

export default defineEventHandler(async (event) => {
  const { user, card } = await loadVisibleCard(event)
  const creator = useDb().select({ email: schema.users.email, name: schema.users.name })
    .from(schema.users).where(eq(schema.users.id, card.createdBy)).get()
  const { imagePath: _p, ...rest } = card
  return { ...rest, createdByEmail: creator?.email ?? '', createdByName: creator?.name ?? '', canEdit: canEdit(user, card) }
})
