import type { User } from '#auth-utils'

// 画面遷移のガード（表示制御のみ。実際の権限判定はサーバー API 側で行う）
export default defineNuxtRouteMiddleware(async (to) => {
  const nuxtApp = useNuxtApp()
  const { loggedIn, user, session, clear } = useUserSession()

  // Cookie 内の role・表示名は古い可能性があるため、ログイン中は遷移ごとに /api/auth/me（DB が正）で更新する。
  // 初回表示の hydration 時は SSR で取得済みの値を使う
  const hydrating = import.meta.client && nuxtApp.isHydrating && nuxtApp.payload.serverRendered
  if (loggedIn.value && !hydrating) {
    try {
      const me = await useRequestFetch()<User>('/api/auth/me')
      if (session.value) session.value.user = me
    }
    catch (e) {
      // 失効したセッション（ログアウト・パスワード変更など）はログイン画面へ
      if ((e as { statusCode?: number }).statusCode === 401) await clear().catch(() => {})
    }
  }

  if (to.path === '/login') return loggedIn.value ? navigateTo('/') : undefined
  if (!loggedIn.value) return navigateTo('/login')
  if (to.path.startsWith('/admin') && user.value?.role !== 'admin') return navigateTo('/')
})
