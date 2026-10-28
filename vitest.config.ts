import { defineConfig } from 'vitest/config'

// server/lib・server/utils の純粋なモジュールを Node 環境で直接テストする（Nuxt ランタイムは使わない）
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
