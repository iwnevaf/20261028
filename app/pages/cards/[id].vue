<script setup lang="ts">
type CardDetail = {
  id: number
  name: string
  companyName: string
  department: string
  title: string
  email: string
  phone: string
  address: string
  website: string
  imageMime: string
  createdAt: string | number
  createdByEmail: string | null
  createdByName: string | null
}

const route = useRoute()
const id = computed(() => String(route.params.id))
const { data: card, status, error } = await useFetch<CardDetail>(() => `/api/cards/${id.value}`)

const notFound = computed(() => error.value?.statusCode === 404)

// http(s) 以外のスキーム（javascript: など）はリンクにしない
const websiteHref = computed(() => {
  const w = card.value?.website?.trim()
  if (!w) return ''
  if (/^https?:\/\//i.test(w)) return w
  return /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(w) ? `https://${w}` : ''
})
const telHref = computed(() => `tel:${(card.value?.phone ?? '').replace(/[^\d+]/g, '')}`)

function formatDate(v: string | number | undefined | null) {
  if (v === undefined || v === null || v === '') return ''
  const d = new Date(typeof v === 'number' && v < 1e12 ? v * 1000 : v)
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString('ja-JP')
}
</script>

<template>
  <div>
    <p><NuxtLink to="/">← 名刺一覧に戻る</NuxtLink></p>
    <p v-if="status === 'pending'" class="notice">読み込み中…</p>
    <div v-else-if="notFound" class="card">
      <p class="error">名刺が見つからないか、閲覧権限がありません</p>
      <p><NuxtLink to="/">名刺一覧に戻る</NuxtLink></p>
    </div>
    <div v-else-if="error" class="card">
      <p class="error">{{ errorMessage(error, '名刺の取得に失敗しました') }}</p>
      <p><NuxtLink to="/">名刺一覧に戻る</NuxtLink></p>
    </div>
    <div v-else-if="card" class="card">
      <h1>{{ card.name }}</h1>
      <div class="split">
        <div>
          <img class="preview" :src="`/api/cards/${card.id}/image`" :alt="`${card.name} の名刺画像`">
        </div>
        <dl class="detail">
          <dt>氏名</dt><dd>{{ card.name }}</dd>
          <dt>会社名</dt><dd>{{ card.companyName || '—' }}</dd>
          <dt>部署</dt><dd>{{ card.department || '—' }}</dd>
          <dt>役職</dt><dd>{{ card.title || '—' }}</dd>
          <dt>メールアドレス</dt>
          <dd><a v-if="card.email" :href="`mailto:${card.email}`">{{ card.email }}</a><template v-else>—</template></dd>
          <dt>電話番号</dt>
          <dd><a v-if="card.phone" :href="telHref">{{ card.phone }}</a><template v-else>—</template></dd>
          <dt>住所</dt><dd>{{ card.address || '—' }}</dd>
          <dt>Webサイト</dt>
          <dd>
            <a v-if="websiteHref" :href="websiteHref" target="_blank" rel="noopener noreferrer">{{ card.website }}</a>
            <template v-else>{{ card.website || '—' }}</template>
          </dd>
          <dt>登録者</dt>
          <dd>
            {{ card.createdByName || card.createdByEmail || '—' }}
            <span v-if="card.createdByName && card.createdByEmail" class="notice">（{{ card.createdByEmail }}）</span>
          </dd>
          <dt>登録日時</dt><dd>{{ formatDate(card.createdAt) }}</dd>
        </dl>
      </div>
    </div>
  </div>
</template>

<style scoped>
.detail { display: grid; grid-template-columns: 8em 1fr; gap: 8px 12px; margin: 0; }
.detail dt { color: var(--muted); font-size: 13px; }
.detail dd { margin: 0; word-break: break-all; white-space: pre-wrap; }
</style>
