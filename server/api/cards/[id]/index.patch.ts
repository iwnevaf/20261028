import { eq } from 'drizzle-orm'

// 8項目のみ更新する。元画像・登録者は変更しない（ボディに含まれていても無視）
export default defineEventHandler(async (event) => {
  const { card } = await requireEditableCard(event)
  const f = parseCardFields(await readBody(event).catch(() => null))

  try {
    return useDb().transaction((tx) => {
      // 会社名・部署名・氏名・メールの変更に合わせて企業・部署・人物を引き直す（登録時と同じ規則）
      const ids = resolveCardEntities(tx, f, { personId: card.personId, name: card.name, email: card.email })
      return tx.update(schema.cards).set({ ...f, ...ids })
        .where(eq(schema.cards.id, card.id))
        .returning({ id: schema.cards.id }).get()
    })
  }
  catch (e) {
    console.error('[cards] 更新に失敗', e)
    throw createError({ statusCode: 500, statusMessage: '保存に失敗しました。もう一度お試しください' })
  }
})
