export default defineNuxtConfig({
  compatibilityDate: '2026-10-28',
  future: { compatibilityVersion: 4 },
  devtools: { enabled: false },
  modules: ['nuxt-auth-utils'],
  css: ['~/assets/main.css'],
  app: {
    head: {
      title: '名刺管理',
      htmlAttrs: { lang: 'ja' },
    },
  },
  runtimeConfig: {
    // サーバー専用。ブラウザーには公開しない
    databasePath: './data/app.db',
    uploadDir: './data/uploads',
    initialAdminEmail: '',
    initialAdminPassword: '',
    initialAdminName: '',
  },
})
