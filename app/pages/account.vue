<script setup lang="ts">
const { user } = useUserSession()

const form = reactive({ currentPassword: '', newPassword: '', confirmPassword: '' })
// 成功後に入力欄（表示/隠す の状態を含む）を作り直すためのキー
const formKey = ref(0)
const error = ref('')
const message = ref('')
const saving = ref(false)

async function changePassword() {
  error.value = ''
  message.value = ''
  if (form.newPassword !== form.confirmPassword) {
    error.value = '新しいパスワード（確認）が一致しません'
    return
  }
  saving.value = true
  try {
    await $fetch('/api/auth/password', {
      method: 'POST',
      body: { currentPassword: form.currentPassword, newPassword: form.newPassword },
    })
    message.value = 'パスワードを変更しました。他の端末・ブラウザーのログインは解除されました'
    Object.assign(form, { currentPassword: '', newPassword: '', confirmPassword: '' })
    formKey.value++
  }
  catch (e) {
    error.value = errorMessage(e, 'パスワードの変更に失敗しました')
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <div>
    <div class="card">
      <h1>アカウント設定</h1>
      <dl class="info">
        <dt>メールアドレス</dt><dd>{{ user?.email }}</dd>
        <dt>表示名</dt><dd>{{ user?.name || '（未設定）' }}</dd>
        <dt>role</dt><dd>{{ user?.role }}</dd>
      </dl>
    </div>
    <div class="card">
      <h2>パスワードの変更</h2>
      <form :key="formKey" class="pw-form" @submit.prevent="changePassword">
        <label>現在のパスワード
          <PasswordInput v-model="form.currentPassword" autocomplete="current-password" />
        </label>
        <label>新しいパスワード（8文字以上）
          <PasswordInput v-model="form.newPassword" :minlength="8" />
        </label>
        <label>新しいパスワード（確認）
          <PasswordInput v-model="form.confirmPassword" :minlength="8" />
        </label>
        <button type="submit" :disabled="saving">変更する</button>
      </form>
      <p v-if="error" class="error">{{ error }}</p>
      <p v-if="message" class="notice">{{ message }}</p>
    </div>
  </div>
</template>

<style scoped>
.info { display: grid; grid-template-columns: max-content 1fr; gap: 6px 16px; margin: 0; }
.info dt { color: var(--muted); font-size: 13px; }
.info dd { margin: 0; }
.pw-form { max-width: 420px; }
</style>
