// 画面遷移のガード（表示制御のみ。実際の権限判定はサーバー API 側で行う）
export default defineNuxtRouteMiddleware((to) => {
  const { loggedIn, user } = useUserSession()
  if (to.path === '/login') return loggedIn.value ? navigateTo('/') : undefined
  if (!loggedIn.value) return navigateTo('/login')
  if (to.path.startsWith('/admin') && user.value?.role !== 'admin') return navigateTo('/')
})
