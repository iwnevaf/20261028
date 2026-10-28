<script setup lang="ts">
import type { CardFields } from '~/utils/card-fields'

type CardDetail = CardFields & {
  id: number
  imageMime: string
  createdAt: string | number
  createdByEmail: string | null
  createdByName: string | null
  canEdit: boolean
}

const route = useRoute()
const id = computed(() => String(route.params.id))
const { data: card, status, error, refresh } = await useFetch<CardDetail>(() => `/api/cards/${id.value}`)

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

// ---- 編集（元画像は差し替えない） ----
const editing = ref(false)
const form = reactive<CardFields>(emptyCardFields())
const saving = ref(false)
const saveError = ref('')
const saved = ref(false)

function startEdit() {
  if (!card.value) return
  for (const def of CARD_FIELD_DEFS) form[def.key] = card.value[def.key] ?? ''
  saveError.value = ''
  saved.value = false
  confirmingDelete.value = false
  editing.value = true
}

function cancelEdit() {
  editing.value = false
  saveError.value = ''
}

async function save() {
  if (!card.value || saving.value) return
  saveError.value = ''
  if (!form.name.trim()) {
    saveError.value = '氏名は必須です'
    return
  }
  saving.value = true
  try {
    await $fetch(`/api/cards/${card.value.id}`, { method: 'PATCH', body: { ...form } })
    await refresh()
    editing.value = false
    saved.value = true
  }
  catch (e) {
    saveError.value = errorMessage(e, '保存に失敗しました。もう一度お試しください')
  }
  finally {
    saving.value = false
  }
}

// ---- 削除（画面内で確認してから実行） ----
const confirmingDelete = ref(false)
const deleting = ref(false)
const deleteError = ref('')
const flash = useState<string>('cards-flash', () => '')

function askDelete() {
  deleteError.value = ''
  saved.value = false
  confirmingDelete.value = true
}

async function doDelete() {
  if (!card.value || deleting.value) return
  deleting.value = true
  deleteError.value = ''
  try {
    const name = card.value.name
    await $fetch(`/api/cards/${card.value.id}`, { method: 'DELETE' })
    flash.value = `名刺「${name}」を削除しました`
    await navigateTo('/')
  }
  catch (e) {
    deleteError.value = errorMessage(e, '削除に失敗しました。もう一度お試しください')
  }
  finally {
    deleting.value = false
  }
}
</script>

<template>
  <div>
    <p><NuxtLink to="/">← 名刺一覧に戻る</NuxtLink></p>
    <p v-if="status === 'pending' && !card" class="notice">読み込み中…</p>
    <div v-else-if="notFound" class="card">
      <p class="error">名刺が見つからないか、閲覧権限がありません</p>
      <p><NuxtLink to="/">名刺一覧に戻る</NuxtLink></p>
    </div>
    <div v-else-if="error" class="card">
      <p class="error">{{ errorMessage(error, '名刺の取得に失敗しました') }}</p>
      <p><NuxtLink to="/">名刺一覧に戻る</NuxtLink></p>
    </div>
    <div v-else-if="card" class="card">
      <div class="title-row">
        <h1>{{ editing ? '名刺を編集' : card.name }}</h1>
        <div v-if="card.canEdit && !editing && !confirmingDelete" class="row">
          <button type="button" class="secondary" @click="startEdit">編集</button>
          <button type="button" class="danger" @click="askDelete">削除</button>
        </div>
      </div>

      <p v-if="saved" class="success">変更を保存しました</p>
      <div v-if="confirmingDelete" class="confirm">
        <p>名刺「{{ card.name }}」と元画像を削除します。元に戻せません。よろしいですか？</p>
        <div class="row">
          <button type="button" class="danger" :disabled="deleting" @click="doDelete">{{ deleting ? '削除中…' : '削除する' }}</button>
          <button type="button" class="secondary" :disabled="deleting" @click="confirmingDelete = false">キャンセル</button>
        </div>
        <p v-if="deleteError" class="error">{{ deleteError }}</p>
      </div>

      <div class="split">
        <div>
          <img class="preview" :src="`/api/cards/${card.id}/image`" :alt="`${card.name} の名刺画像`">
          <p v-if="editing" class="notice">元画像は登録時のまま保持され、編集では差し替えできません。</p>
        </div>

        <form v-if="editing" @submit.prevent="save">
          <label v-for="def in CARD_FIELD_DEFS" :key="def.key">
            {{ def.label }}{{ def.required ? '（必須）' : '' }}
            <input v-model="form[def.key]" :type="def.type || 'text'" :required="def.required" :disabled="saving">
          </label>
          <p v-if="saveError" class="error">{{ saveError }}</p>
          <div class="row">
            <button type="submit" :disabled="saving">{{ saving ? '保存中…' : '保存' }}</button>
            <button type="button" class="secondary" :disabled="saving" @click="cancelEdit">キャンセル</button>
          </div>
        </form>

        <dl v-else class="detail">
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
.title-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; }
.detail { display: grid; grid-template-columns: 8em 1fr; gap: 8px 12px; margin: 0; }
.detail dt { color: var(--muted); font-size: 13px; }
.detail dd { margin: 0; word-break: break-all; white-space: pre-wrap; }
.confirm { border: 1px solid var(--danger); border-radius: 6px; padding: 12px 16px; margin-bottom: 16px; }
.confirm p { margin: 0 0 12px; }
.confirm .error { margin: 12px 0 0; }
.success { color: #1a7f37; background: #dafbe1; border: 1px solid #aceebb; padding: 8px 12px; border-radius: 6px; }
</style>
