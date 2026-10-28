<script setup lang="ts">
const { loggedIn, user, clear } = useUserSession()

async function logout() {
  await $fetch('/api/auth/logout', { method: 'POST' })
  await clear()
  await navigateTo('/login')
}
</script>

<template>
  <div>
    <header v-if="loggedIn" class="header">
      <NuxtLink to="/" class="brand">名刺管理</NuxtLink>
      <nav>
        <NuxtLink to="/">名刺一覧</NuxtLink>
        <NuxtLink to="/cards/new">名刺を登録</NuxtLink>
        <NuxtLink v-if="user?.role === 'admin'" to="/admin/users">利用者・閲覧許可</NuxtLink>
      </nav>
      <div class="me">
        <span>{{ user?.name || user?.email }}（{{ user?.role }}）</span>
        <button class="secondary" @click="logout">ログアウト</button>
      </div>
    </header>
    <main class="main">
      <NuxtPage />
    </main>
  </div>
</template>
