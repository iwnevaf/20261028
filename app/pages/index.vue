<script setup lang="ts">
type CardRow = {
  id: number
  name: string
  companyName: string
  department: string
  title: string
  email: string
  phone: string
  createdAt: string
  createdByEmail: string | null
}

const route = useRoute()
// 詳細画面で削除したあとの完了メッセージ（1回だけ表示）
const flash = useState<string>('cards-flash', () => '')
const message = ref(flash.value)
flash.value = ''
const q = ref(typeof route.query.q === 'string' ? route.query.q : '')
const query = ref(q.value)

const { data: cards, status, error, refresh } = await useFetch<CardRow[]>('/api/cards', {
  query: computed(() => (query.value ? { q: query.value } : {})),
})

function search() {
  query.value = q.value.trim()
  navigateTo({ path: '/', query: query.value ? { q: query.value } : {} }, { replace: true })
}

function clearSearch() {
  q.value = ''
  search()
}
</script>

<template>
  <div>
    <p v-if="message" class="success">{{ message }}</p>
    <div class="card">
      <h1>名刺一覧</h1>
      <form class="row" @submit.prevent="search">
        <label class="grow">氏名・会社名で検索<input v-model="q" type="search" placeholder="氏名または会社名の一部"></label>
        <button type="submit">検索</button>
        <button v-if="query" type="button" class="secondary" @click="clearSearch">クリア</button>
      </form>
    </div>

    <div class="card">
      <p v-if="status === 'pending'" class="notice">読み込み中…</p>
      <div v-else-if="error">
        <p class="error">{{ errorMessage(error, '名刺一覧の取得に失敗しました') }}</p>
        <button class="secondary" @click="() => refresh()">再読み込み</button>
      </div>
      <template v-else-if="cards && cards.length">
        <p class="notice">{{ cards.length }} 件</p>
        <table>
          <thead>
            <tr><th>氏名</th><th>会社名</th><th>部署</th><th>役職</th><th>メール</th><th>電話</th><th>登録者</th></tr>
          </thead>
          <tbody>
            <tr v-for="c in cards" :key="c.id">
              <td><NuxtLink :to="`/cards/${c.id}`">{{ c.name }}</NuxtLink></td>
              <td>{{ c.companyName }}</td>
              <td>{{ c.department }}</td>
              <td>{{ c.title }}</td>
              <td>{{ c.email }}</td>
              <td>{{ c.phone }}</td>
              <td>{{ c.createdByEmail }}</td>
            </tr>
          </tbody>
        </table>
      </template>
      <p v-else class="notice">
        <template v-if="query">「{{ query }}」に一致する名刺はありません。</template>
        <template v-else>閲覧できる名刺はまだありません。<NuxtLink to="/cards/new">名刺を登録</NuxtLink>してください。</template>
      </p>
    </div>
  </div>
</template>

<style scoped>
.grow { flex: 1; min-width: 240px; }
.success { color: #1a7f37; background: #dafbe1; border: 1px solid #aceebb; padding: 8px 12px; border-radius: 6px; }
</style>
