<script setup lang="ts">
type Role = 'admin' | 'user'
type U = { id: number, email: string, name: string, role: Role }
const { data: users, refresh } = await useFetch<U[]>('/api/admin/users')
const { user: me } = useUserSession()

const form = reactive({ email: '', name: '', password: '' })
const addKey = ref(0)
const error = ref('')
const message = ref('')

async function addUser() {
  error.value = ''
  message.value = ''
  try {
    await $fetch('/api/admin/users', { method: 'POST', body: form })
    message.value = `${form.email} を追加しました`
    Object.assign(form, { email: '', name: '', password: '' })
    addKey.value++
    await refresh()
  }
  catch (e) {
    error.value = errorMessage(e, '利用者の追加に失敗しました')
  }
}

// 行ごとの操作（role 変更・パスワード再設定）。確認は画面内で行う
type Action = { id: number, kind: 'role', role: Role } | { id: number, kind: 'password', confirming: boolean }
const action = ref<Action | null>(null)
const newPassword = ref('')
const listError = ref('')
const listMessage = ref('')
const busy = ref(false)

function startRole(u: U) {
  action.value = { id: u.id, kind: 'role', role: u.role === 'admin' ? 'user' : 'admin' }
  listError.value = ''
  listMessage.value = ''
}

function startPassword(u: U) {
  action.value = { id: u.id, kind: 'password', confirming: false }
  newPassword.value = ''
  listError.value = ''
  listMessage.value = ''
}

function cancel() {
  action.value = null
  newPassword.value = ''
}

async function run(fn: () => Promise<unknown>, done: string, failed: string) {
  busy.value = true
  listError.value = ''
  listMessage.value = ''
  try {
    await fn()
    listMessage.value = done
    cancel()
    await refresh()
  }
  catch (e) {
    listError.value = errorMessage(e, failed)
  }
  finally {
    busy.value = false
  }
}

// 型付きルートの推論が深くなりすぎて型検査が通らないため、URL を string として渡す
function changeRole(u: U, role: Role) {
  const url: string = `/api/admin/users/${u.id}/role`
  return run(() => $fetch<U, string>(url, { method: 'PATCH', body: { role } }),
    `${u.email} の role を ${role} に変更しました`, 'role の変更に失敗しました')
}

function confirmPassword() {
  if (action.value?.kind !== 'password') return
  if (newPassword.value.length < 8) {
    listError.value = 'パスワードは8文字以上にしてください'
    return
  }
  listError.value = ''
  action.value = { ...action.value, confirming: true }
}

function resetPassword(u: U) {
  const url: string = `/api/admin/users/${u.id}/password`
  return run(() => $fetch<{ ok: boolean }, string>(url, { method: 'POST', body: { newPassword: newPassword.value } }),
    `${u.email} のパスワードを再設定しました（ログイン中のセッションは解除されました）`, 'パスワードの再設定に失敗しました')
}

const isActive = (u: U) => action.value?.id === u.id
</script>

<template>
  <div>
    <div class="card">
      <h1>利用者の追加</h1>
      <form class="row" @submit.prevent="addUser">
        <label>メールアドレス<input v-model="form.email" type="email" required></label>
        <label>表示名<input v-model="form.name"></label>
        <label>初期パスワード（8文字以上）
          <PasswordInput :key="addKey" v-model="form.password" :minlength="8" />
        </label>
        <button type="submit">追加</button>
      </form>
      <p v-if="error" class="error">{{ error }}</p>
      <p v-if="message" class="notice">{{ message }}</p>
    </div>
    <div class="card">
      <h2>利用者一覧</h2>
      <p v-if="listError" class="error">{{ listError }}</p>
      <p v-if="listMessage" class="notice">{{ listMessage }}</p>
      <table>
        <thead><tr><th>メールアドレス</th><th>表示名</th><th>role</th><th>閲覧許可</th><th>操作</th></tr></thead>
        <tbody>
          <template v-for="u in users" :key="u.id">
            <tr>
              <td>{{ u.email }}</td>
              <td>{{ u.name }}</td>
              <td>{{ u.role }}</td>
              <td><NuxtLink v-if="u.role === 'user'" :to="`/admin/users/${u.id}`">閲覧許可を設定</NuxtLink></td>
              <td>
                <span v-if="u.id === me?.id" class="notice">自分（変更はアカウント設定から）</span>
                <span v-else class="ops">
                  <button type="button" class="secondary" :disabled="busy" @click="startRole(u)">
                    {{ u.role === 'admin' ? 'user に変更' : 'admin に変更' }}
                  </button>
                  <button type="button" class="secondary" :disabled="busy" @click="startPassword(u)">パスワード再設定</button>
                </span>
              </td>
            </tr>
            <tr v-if="isActive(u) && action" class="panel">
              <td colspan="5">
                <div v-if="action.kind === 'role'" class="confirm">
                  <span v-if="action.role === 'admin'">
                    {{ u.email }} を admin に変更しますか？ admin は全名刺を閲覧でき、利用者・閲覧許可を管理できます（付与済みの閲覧許可は残りますが、admin の間は使われません）。
                  </span>
                  <span v-else>
                    {{ u.email }} を user に変更しますか？ 次の操作から admin の権限を失い、付与済みの閲覧許可の範囲だけを閲覧できます。
                  </span>
                  <button type="button" :disabled="busy" @click="changeRole(u, action.role)">変更する</button>
                  <button type="button" class="secondary" :disabled="busy" @click="cancel">キャンセル</button>
                </div>
                <form v-else-if="!action.confirming" class="row" @submit.prevent="confirmPassword">
                  <label>{{ u.email }} の新しいパスワード（8文字以上）
                    <PasswordInput v-model="newPassword" :minlength="8" />
                  </label>
                  <button type="submit">次へ</button>
                  <button type="button" class="secondary" @click="cancel">キャンセル</button>
                </form>
                <div v-else class="confirm">
                  <span>{{ u.email }} のパスワードを再設定しますか？ この利用者のログイン中のセッションはすべて解除されます。新しいパスワードは本人に別途伝えてください。</span>
                  <button type="button" class="danger" :disabled="busy" @click="resetPassword(u)">再設定する</button>
                  <button type="button" class="secondary" :disabled="busy" @click="cancel">キャンセル</button>
                </div>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.ops { display: flex; gap: 6px; flex-wrap: wrap; }
.ops button { padding: 4px 10px; font-size: 13px; }
.panel td { background: var(--bg); }
.confirm { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
</style>
