<script setup lang="ts">
const { fetch: refreshSession } = useUserSession()
const email = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

async function submit() {
  error.value = ''
  loading.value = true
  try {
    await $fetch('/api/auth/login', { method: 'POST', body: { email: email.value, password: password.value } })
    await refreshSession()
    await navigateTo('/')
  }
  catch (e) {
    error.value = errorMessage(e, 'ログインに失敗しました')
  }
  finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="card narrow">
    <h1>名刺管理 ログイン</h1>
    <form @submit.prevent="submit">
      <label>メールアドレス<input v-model="email" type="email" required autocomplete="username"></label>
      <label>パスワード<input v-model="password" type="password" required autocomplete="current-password"></label>
      <p v-if="error" class="error">{{ error }}</p>
      <button type="submit" :disabled="loading">ログイン</button>
    </form>
  </div>
</template>
