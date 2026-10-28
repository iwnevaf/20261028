<script setup lang="ts">
type U = { id: number, email: string, name: string, role: 'admin' | 'user' }
const { data: users, refresh } = await useFetch<U[]>('/api/admin/users')

const form = reactive({ email: '', name: '', password: '' })
const showPassword = ref(false)
const error = ref('')
const message = ref('')

async function addUser() {
  error.value = ''
  message.value = ''
  try {
    await $fetch('/api/admin/users', { method: 'POST', body: form })
    message.value = `${form.email} を追加しました`
    Object.assign(form, { email: '', name: '', password: '' })
    showPassword.value = false
    await refresh()
  }
  catch (e) {
    error.value = errorMessage(e, '利用者の追加に失敗しました')
  }
}
</script>

<template>
  <div>
    <div class="card">
      <h1>利用者の追加</h1>
      <form class="row" @submit.prevent="addUser">
        <label>メールアドレス<input v-model="form.email" type="email" required></label>
        <label>表示名<input v-model="form.name"></label>
        <label>初期パスワード（8文字以上）
          <span class="password">
            <input v-model="form.password" :type="showPassword ? 'text' : 'password'" required minlength="8" autocomplete="new-password">
            <button type="button" class="secondary" :aria-pressed="showPassword" @click="showPassword = !showPassword">
              {{ showPassword ? '隠す' : '表示' }}
            </button>
          </span>
        </label>
        <button type="submit">追加</button>
      </form>
      <p v-if="error" class="error">{{ error }}</p>
      <p v-if="message" class="notice">{{ message }}</p>
    </div>
    <div class="card">
      <h2>利用者一覧</h2>
      <table>
        <thead><tr><th>メールアドレス</th><th>表示名</th><th>role</th><th /></tr></thead>
        <tbody>
          <tr v-for="u in users" :key="u.id">
            <td>{{ u.email }}</td>
            <td>{{ u.name }}</td>
            <td>{{ u.role }}</td>
            <td><NuxtLink v-if="u.role === 'user'" :to="`/admin/users/${u.id}`">閲覧許可を設定</NuxtLink></td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.password { display: flex; gap: 6px; }
.password input { flex: 1; }
.password button { padding: 8px 12px; white-space: nowrap; }
</style>
