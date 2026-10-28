export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  return useDb().select({
    id: schema.users.id,
    email: schema.users.email,
    name: schema.users.name,
    role: schema.users.role,
  }).from(schema.users).orderBy(schema.users.id).all()
})
