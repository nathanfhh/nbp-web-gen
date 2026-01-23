import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useLocalStorage } from './useLocalStorage'

/**
 * API Key 管理與分流
 *
 * 本專案使用雙 API Key 架構：
 * - 付費金鑰 (Primary): 用於圖片/影片生成，強制使用
 * - Free Tier 金鑰 (Secondary): 用於文字處理，優先使用
 *
 * Usage Types:
 * - 'image': 圖片/影片生成，強制使用付費金鑰
 * - 'text': 文字處理，優先 Free Tier，免費額度用罄時 fallback 到付費
 */
export function useApiKeyManager() {
  const {
    getApiKey: getPaidApiKey,
    setApiKey: setPaidApiKey,
    hasApiKey: hasPaidApiKey,
    getFreeTierApiKey,
    setFreeTierApiKey,
    hasFreeTierApiKey,
  } = useLocalStorage()
  const { t } = useI18n()

  // 追蹤 Free Tier 額度狀態（session-level）
  const freeTierExhausted = ref(false)

  // Timeout ID for auto-reset (to prevent memory leaks)
  let resetTimeoutId = null

  // 追蹤當前正在使用的 key 類型（用於 UI 顯示）
  const lastUsedKeyType = ref(null) // 'paid' | 'freeTier' | null

  /**
   * 根據使用情境取得適當的 API Key
   * @param {'image' | 'text'} usage - 使用情境
   * @returns {string} API Key
   */
  const getApiKey = (usage = 'image') => {
    if (usage === 'image') {
      // 圖片/影片生成：強制使用付費金鑰
      lastUsedKeyType.value = 'paid'
      return getPaidApiKey()
    }

    // 文字處理：優先 Free Tier
    if (!freeTierExhausted.value) {
      const freeTierKey = getFreeTierApiKey()
      if (freeTierKey) {
        lastUsedKeyType.value = 'freeTier'
        return freeTierKey
      }
    }

    // Fallback 到付費金鑰
    lastUsedKeyType.value = 'paid'
    return getPaidApiKey()
  }

  /**
   * 檢查指定使用情境是否有可用的 API Key
   * @param {'image' | 'text'} usage - 使用情境
   * @returns {boolean}
   */
  const hasApiKeyFor = (usage = 'image') => {
    if (usage === 'image') {
      return hasPaidApiKey()
    }
    // 文字處理：Free Tier 或付費金鑰任一可用即可
    return hasFreeTierApiKey() || hasPaidApiKey()
  }

  /**
   * 標記 Free Tier 額度已耗盡
   * 在收到 429 或額度相關錯誤時調用
   */
  const markFreeTierExhausted = () => {
    freeTierExhausted.value = true
    // Clear any existing timeout to avoid duplicates
    if (resetTimeoutId) {
      clearTimeout(resetTimeoutId)
    }
    // 1 小時後自動重試（Free Tier 通常每分鐘/每小時重置）
    resetTimeoutId = setTimeout(() => {
      freeTierExhausted.value = false
      resetTimeoutId = null
    }, 60 * 60 * 1000)
  }

  /**
   * 重置 Free Tier 額度狀態（手動重試時使用）
   */
  const resetFreeTierStatus = () => {
    if (resetTimeoutId) {
      clearTimeout(resetTimeoutId)
      resetTimeoutId = null
    }
    freeTierExhausted.value = false
  }

  /**
   * 帶有自動 fallback 的 API 調用包裝器
   * @param {(apiKey: string) => Promise<T>} apiCall - API 調用函數
   * @param {'image' | 'text'} usage - 使用情境
   * @returns {Promise<T>}
   */
  const callWithFallback = async (apiCall, usage = 'text') => {
    const primaryKey = getApiKey(usage)

    if (!primaryKey) {
      throw new Error(t('errors.apiKeyNotSet'))
    }

    try {
      return await apiCall(primaryKey)
    } catch (error) {
      // 檢查是否為額度不足錯誤，且當前使用的是 Free Tier
      if (isQuotaError(error) && usage === 'text' && lastUsedKeyType.value === 'freeTier') {
        markFreeTierExhausted()

        // 嘗試使用付費金鑰
        const fallbackKey = getPaidApiKey()
        if (fallbackKey) {
          lastUsedKeyType.value = 'paid'
          console.info('[API] Free Tier 免費額度用罄，自動切換到付費金鑰')
          return await apiCall(fallbackKey)
        }
      }
      throw error
    }
  }

  return {
    // API Key 取得
    getApiKey,
    hasApiKeyFor,

    // 直接存取（用於設定頁面）
    getPaidApiKey,
    setPaidApiKey,
    hasPaidApiKey,
    getFreeTierApiKey,
    setFreeTierApiKey,
    hasFreeTierApiKey,

    // 額度管理
    markFreeTierExhausted,
    resetFreeTierStatus,
    freeTierExhausted: computed(() => freeTierExhausted.value),

    // 帶 fallback 的調用
    callWithFallback,

    // 狀態（用於 UI 顯示）
    lastUsedKeyType: computed(() => lastUsedKeyType.value),
  }
}

/**
 * 檢查錯誤是否為額度不足相關
 */
function isQuotaError(error) {
  // HTTP 狀態碼檢查
  if (error?.status === 429 || error?.code === 429) {
    return true
  }

  // 錯誤訊息檢查
  const message = (error?.message || error?.error?.message || '').toLowerCase()
  return (
    message.includes('quota') ||
    message.includes('rate limit') ||
    message.includes('exhausted') ||
    message.includes('exceeded') ||
    message.includes('too many requests')
  )
}
