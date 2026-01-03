<script setup>
import { useGeneratorStore } from '@/stores/generator'

const store = useGeneratorStore()

const placeholders = {
  generate: '描述您想要生成的圖片，例如：一隻在星空下的貓咪...',
  edit: '描述您想要對圖片進行的修改，例如：加上太陽眼鏡...',
  story: '描述故事的主題，例如：一顆種子成長為大樹的過程...',
  diagram: '描述圖表的內容，例如：使用者登入的流程圖...',
}
</script>

<template>
  <div class="space-y-3">
    <label class="block text-sm font-medium text-gray-300">
      Prompt 描述
    </label>
    <textarea
      v-model="store.prompt"
      :placeholder="placeholders[store.currentMode]"
      class="textarea-premium min-h-[140px]"
      rows="4"
    ></textarea>
    <div class="flex justify-between items-center text-xs text-gray-500">
      <span>提示：描述越詳細，生成效果越好</span>
      <span>{{ store.prompt.length }} 字元</span>
    </div>
  </div>
</template>
