import { ref, computed, onScopeDispose } from 'vue'
import { useI18n } from 'vue-i18n'
import { useLocalStorage } from './useLocalStorage'

/**
 * API Key 管理與分流
 *
 * 本專案支援兩個 Provider：
 *
 * Gemini — 雙 Key 架構
 * - 付費金鑰 (Primary)：圖片/影片生成，強制使用
 * - Free Tier 金鑰 (Secondary)：文字處理，優先使用，耗盡時 fallback 到付費
 *
 * OpenAI — 單一金鑰（無 free tier 概念）
 * - 圖片、文字、embedding、TTS 共用同一把 key
 *
 * API 形式：
 * - 舊式（Gemini 專用，保留向後相容）：getApiKey('image' | 'text')
 * - 新式（明確指定 provider）：getApiKey({ provider, usage })
 *   provider: 'gemini' | 'openai'
 *   usage:    'image' | 'text'（僅 Gemini 會用到）
 */
export function useApiKeyManager() {
  const {
    getApiKey: getPaidApiKey,
    setApiKey: setPaidApiKey,
    hasApiKey: hasPaidApiKey,
    getFreeTierApiKey,
    setFreeTierApiKey,
    hasFreeTierApiKey,
    getOpenAIApiKey,
    setOpenAIApiKey,
    hasOpenAIApiKey,
  } = useLocalStorage()
  const { t } = useI18n()

  // 追蹤 Free Tier 額度狀態（session-level）
  const freeTierExhausted = ref(false)

  // Timeout ID for auto-reset (to prevent memory leaks)
  let resetTimeoutId = null

  // 追蹤當前正在使用的 key 類型（用於 UI 顯示）
  const lastUsedKeyType = ref(null) // 'paid' | 'freeTier' | null

  /**
   * 取得 API Key。支援舊式字串 usage 與新式物件參數。
   *
   * @param {('image'|'text')|{provider:'gemini'|'openai', usage?:'image'|'text'}} arg
   * @returns {string} API Key
   */
  const getApiKey = (arg = 'image') => {
    const { provider, usage } = normalizeKeyArg(arg)

    if (provider === 'openai') {
      lastUsedKeyType.value = 'openai'
      return getOpenAIApiKey()
    }

    // Gemini
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
   * 檢查指定情境是否有可用的 API Key。
   * @param {('image'|'text')|{provider:'gemini'|'openai', usage?:'image'|'text'}} arg
   * @returns {boolean}
   */
  const hasApiKeyFor = (arg = 'image') => {
    const { provider, usage } = normalizeKeyArg(arg)

    if (provider === 'openai') {
      return hasOpenAIApiKey()
    }

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

  // Clean up timeout on scope dispose to prevent memory leaks
  onScopeDispose(() => {
    if (resetTimeoutId) {
      clearTimeout(resetTimeoutId)
      resetTimeoutId = null
    }
  })

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
    getOpenAIApiKey,
    setOpenAIApiKey,
    hasOpenAIApiKey,

    // 額度管理
    markFreeTierExhausted,
    resetFreeTierStatus,
    freeTierExhausted: computed(() => freeTierExhausted.value),

    // 帶 fallback 的調用（Gemini 雙 key 專用）
    callWithFallback,

    // 狀態（用於 UI 顯示）
    lastUsedKeyType: computed(() => lastUsedKeyType.value),
  }
}

/**
 * 把 getApiKey/hasApiKeyFor 的多型參數統一成 { provider, usage }。
 * 字串輸入一律視為 Gemini usage。
 */
export function normalizeKeyArg(arg) {
  if (typeof arg === 'string') {
    return { provider: 'gemini', usage: arg }
  }
  if (arg && typeof arg === 'object') {
    return {
      provider: arg.provider || 'gemini',
      usage: arg.usage || 'image',
    }
  }
  return { provider: 'gemini', usage: 'image' }
}

/**
 * 檢查錯誤是否為額度不足相關
 */
export function isQuotaError(error) {
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
