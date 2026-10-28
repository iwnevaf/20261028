<script setup lang="ts">
// 伏せ字のパスワード入力欄と 表示/隠す 切り替えボタン
const model = defineModel<string>({ required: true })
withDefaults(defineProps<{ autocomplete?: string, minlength?: number, required?: boolean }>(), {
  autocomplete: 'new-password',
  minlength: undefined,
  required: true,
})
const show = ref(false)
</script>

<template>
  <span class="password">
    <input v-model="model" :type="show ? 'text' : 'password'" :required="required" :minlength="minlength" :autocomplete="autocomplete">
    <button type="button" class="secondary" :aria-pressed="show" @click="show = !show">
      {{ show ? '隠す' : '表示' }}
    </button>
  </span>
</template>

<style scoped>
.password { display: flex; gap: 6px; }
.password input { flex: 1; }
.password button { padding: 8px 12px; white-space: nowrap; }
</style>
