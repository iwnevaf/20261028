<script setup lang="ts">
const ACCEPT = ['image/jpeg', 'image/png', 'image/webp']
const MAX_BYTES = 10 * 1024 * 1024

type Fields = {
  name: string
  companyName: string
  department: string
  title: string
  email: string
  phone: string
  address: string
  website: string
}
const FIELD_DEFS: { key: keyof Fields, label: string, type?: string, required?: boolean }[] = [
  { key: 'name', label: '氏名', required: true },
  { key: 'companyName', label: '会社名' },
  { key: 'department', label: '部署' },
  { key: 'title', label: '役職' },
  { key: 'email', label: 'メールアドレス', type: 'email' },
  { key: 'phone', label: '電話番号', type: 'tel' },
  { key: 'address', label: '住所' },
  { key: 'website', label: 'Webサイト' },
]

const emptyFields = (): Fields => ({ name: '', companyName: '', department: '', title: '', email: '', phone: '', address: '', website: '' })
const form = reactive<Fields>(emptyFields())

const file = ref<File | null>(null)
const previewUrl = ref('')
const fileError = ref('')
const fileInput = ref<HTMLInputElement | null>(null)

const extracting = ref(false)
const extractError = ref('')
const extractDone = ref(false)

const saving = ref(false)
const saveError = ref('')

function setPreview(f: File | null) {
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  previewUrl.value = f ? URL.createObjectURL(f) : ''
}

function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  const f = input.files?.[0]
  if (!f) return
  fileError.value = ''
  if (!ACCEPT.includes(f.type)) {
    fileError.value = '対応していない形式です。JPEG / PNG / WebP の画像を選択してください'
    input.value = ''
    return
  }
  if (f.size > MAX_BYTES) {
    fileError.value = '画像サイズが10MBを超えています。10MB以下の画像を選択してください'
    input.value = ''
    return
  }
  file.value = f
  setPreview(f)
  extractError.value = ''
  extractDone.value = false
  saveError.value = ''
}

function chooseAnother() {
  fileInput.value?.click()
}

async function extract() {
  if (!file.value || extracting.value) return
  extracting.value = true
  extractError.value = ''
  extractDone.value = false
  try {
    const body = new FormData()
    body.append('image', file.value)
    const res = await $fetch<Partial<Fields>>('/api/cards/extract', { method: 'POST', body })
    if (!res || typeof res !== 'object') throw new Error('invalid response')
    for (const def of FIELD_DEFS) {
      const v = res[def.key]
      form[def.key] = typeof v === 'string' ? v : ''
    }
    extractDone.value = true
  }
  catch {
    extractError.value = '読み取りに失敗しました。もう一度試すか、手入力で登録してください'
  }
  finally {
    extracting.value = false
  }
}

async function save() {
  if (!file.value || saving.value) return
  saveError.value = ''
  if (!form.name.trim()) {
    saveError.value = '氏名は必須です'
    return
  }
  saving.value = true
  try {
    const body = new FormData()
    body.append('image', file.value)
    for (const def of FIELD_DEFS) body.append(def.key, form[def.key])
    const res = await $fetch<{ id: number }>('/api/cards', { method: 'POST', body })
    await navigateTo(`/cards/${res.id}`)
  }
  catch (e) {
    saveError.value = errorMessage(e, '保存に失敗しました。もう一度お試しください')
  }
  finally {
    saving.value = false
  }
}

onBeforeUnmount(() => setPreview(null))
</script>

<template>
  <div>
    <div class="card">
      <h1>名刺を登録</h1>
      <label class="field">
        名刺画像（1枚）
        <input ref="fileInput" type="file" accept="image/jpeg,image/png,image/webp" @change="onFileChange">
      </label>
      <p class="notice">対応形式: JPEG / PNG / WebP（10MB まで）</p>
      <p v-if="fileError" class="error">{{ fileError }}</p>
    </div>

    <div v-if="file" class="card split">
      <div>
        <img class="preview" :src="previewUrl" alt="選択した名刺画像">
        <p class="notice">{{ file.name }}</p>
        <div class="row">
          <button type="button" :disabled="extracting || saving" @click="extract">
            {{ extracting ? '読み取り中…' : 'AIで読み取る' }}
          </button>
          <button type="button" class="secondary" :disabled="extracting || saving" @click="chooseAnother">別の画像を選ぶ</button>
        </div>
        <p v-if="extracting" class="notice">画像を読み取っています。しばらくお待ちください…</p>
        <div v-if="extractError" class="extract-error">
          <p class="error">{{ extractError }}</p>
          <button type="button" class="secondary" :disabled="extracting" @click="extract">もう一度読み取る</button>
        </div>
        <p v-if="extractDone" class="notice">読み取り結果をフォームに反映しました。内容を確認・修正してから登録してください。</p>
      </div>

      <form @submit.prevent="save">
        <label v-for="def in FIELD_DEFS" :key="def.key">
          {{ def.label }}{{ def.required ? '（必須）' : '' }}
          <input v-model="form[def.key]" :type="def.type || 'text'" :required="def.required" :disabled="extracting">
        </label>
        <p v-if="saveError" class="error">{{ saveError }}</p>
        <button type="submit" :disabled="saving || extracting">{{ saving ? '登録中…' : '登録' }}</button>
      </form>
    </div>
  </div>
</template>

<style scoped>
.extract-error { margin-top: 12px; }
.split > div .row { margin-top: 12px; }
</style>
