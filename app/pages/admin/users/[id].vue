<script setup lang="ts">
type GrantType = 'company' | 'department' | 'person'
type GrantRow = { id: number, type: GrantType, label: string, createdAt: string }
type Detail = { user: { id: number, email: string, name: string, role: 'admin' | 'user' }, grants: GrantRow[] }
type Targets = {
  companies: { id: number, name: string }[]
  departments: { id: number, name: string, companyId: number, companyName: string }[]
  persons: { id: number, name: string, companyNames: string[], emails: string[], cardCount: number }[]
}

const route = useRoute()
const userId = computed(() => String(route.params.id))
const { data, error: loadError, refresh } = await useFetch<Detail>(() => `/api/admin/users/${userId.value}/grants`)
const { data: targets } = await useFetch<Targets>('/api/admin/targets')

const typeLabels: Record<GrantType, string> = { company: '企業', department: '部署', person: '人物' }
const type = ref<GrantType>('company')
const targetId = ref<number | ''>('')
const error = ref('')
const message = ref('')

watch(type, () => { targetId.value = '' })

// 選択肢のラベル。部署は企業とセット、人物は会社名・メールで同姓同名を区別する
const options = computed(() => {
  const t = targets.value
  if (!t) return []
  if (type.value === 'company') return t.companies.map(c => ({ id: c.id, label: c.name }))
  if (type.value === 'department') return t.departments.map(d => ({ id: d.id, label: `${d.companyName} › ${d.name}` }))
  return t.persons.map((p) => {
    const info = [p.companyNames.join('・'), p.emails.join('・')].filter(Boolean).join(' / ')
    return { id: p.id, label: `${p.name}（${info || '会社・メールなし'}）` }
  })
})

async function addGrant() {
  error.value = ''
  message.value = ''
  if (targetId.value === '') {
    error.value = '対象を選択してください'
    return
  }
  const key = type.value === 'company' ? 'companyId' : type.value === 'department' ? 'departmentId' : 'personId'
  try {
    await $fetch(`/api/admin/users/${userId.value}/grants`, {
      method: 'POST',
      body: { type: type.value, [key]: targetId.value },
    })
    message.value = '許可を付与しました'
    targetId.value = ''
    await refresh()
  }
  catch (e) {
    error.value = errorMessage(e, '許可の付与に失敗しました')
  }
}

async function revoke(g: GrantRow) {
  error.value = ''
  message.value = ''
  if (!confirm(`「${g.label}」の許可を解除しますか？`)) return
  try {
    await $fetch(`/api/admin/grants/${g.id}`, { method: 'DELETE' })
    message.value = '許可を解除しました'
    await refresh()
  }
  catch (e) {
    error.value = errorMessage(e, '許可の解除に失敗しました')
  }
}
</script>

<template>
  <div>
    <p><NuxtLink to="/admin/users">← 利用者一覧へ</NuxtLink></p>
    <div v-if="loadError" class="card">
      <p class="error">{{ errorMessage(loadError, '利用者を読み込めませんでした') }}</p>
    </div>
    <template v-else-if="data">
      <div class="card">
        <h1>閲覧許可: {{ data.user.email }}</h1>
        <p v-if="data.user.name">表示名: {{ data.user.name }}</p>
        <p class="hint">
          利用者は自分が登録した名刺を常に閲覧できます。加えて、下記の許可のいずれか1つに該当する名刺も閲覧できます。
          部署の許可はその企業の部署だけが対象で、他社の同名部署には及びません。人物の許可は指定した人物だけが対象で、同姓同名の別人には及びません。
        </p>
        <p v-if="data.user.role === 'admin'" class="notice">admin は全名刺を閲覧できるため、許可の設定は不要です。</p>
      </div>

      <div class="card">
        <h2>現在の許可</h2>
        <p v-if="!data.grants.length">許可はありません（自分が登録した名刺のみ閲覧できます）。</p>
        <table v-else>
          <thead><tr><th>種類</th><th>対象</th><th>付与日時</th><th /></tr></thead>
          <tbody>
            <tr v-for="g in data.grants" :key="g.id">
              <td>{{ typeLabels[g.type] }}</td>
              <td>{{ g.label }}</td>
              <td>{{ new Date(g.createdAt).toLocaleString('ja-JP') }}</td>
              <td><button type="button" class="danger" @click="revoke(g)">解除</button></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="data.user.role === 'user'" class="card">
        <h2>許可の追加</h2>
        <form class="row" @submit.prevent="addGrant">
          <label>種類
            <select v-model="type">
              <option value="company">企業（その企業の全名刺）</option>
              <option value="department">部署（指定企業の指定部署の名刺）</option>
              <option value="person">人物（指定した人物の名刺）</option>
            </select>
          </label>
          <label>対象
            <select v-model="targetId" required>
              <option value="" disabled>選択してください</option>
              <option v-for="o in options" :key="o.id" :value="o.id">{{ o.label }}</option>
            </select>
          </label>
          <button type="submit">付与</button>
        </form>
        <p v-if="!options.length" class="hint">選択できる{{ typeLabels[type] }}がありません（名刺の登録後に表示されます）。</p>
      </div>
      <p v-if="error" class="error">{{ error }}</p>
      <p v-if="message" class="notice">{{ message }}</p>
    </template>
  </div>
</template>

<style scoped>
.hint {
  color: #555;
  font-size: 0.9em;
}
</style>
