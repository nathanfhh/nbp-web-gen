# API Key 管理

Mediator 支援雙 API Key 架構，幫助你更有效率地使用 API 額度。

## 影片教學：如何申請 API Key

<iframe width="100%" style="aspect-ratio: 16/9;" src="https://www.youtube.com/embed/bBhEVJjb8lQ" title="如何申請 Gemini API Key" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>

這部影片教你如何申請 API Key 以及連結 Google Cloud 帳戶。首次申請的用戶可以獲得 **$300 美元的免費折抵額度**，可以用於 Mediator 的所有功能（圖片生成、影片生成等）以及其他 Google AI API。

## 單一 API Key

最簡單的設定方式：

1. 開啟設定
2. 在「API Key」欄位輸入你的 Key
3. 所有功能都會使用這組 Key

## 雙 API Key 模式

如果你同時有付費帳號和免費帳號，可以設定兩組 Key：

### 主要 Key（付費）

用於消耗較多額度的操作：

- 圖片生成
- 影片生成

### Free Tier Key（免費）

用於文字處理操作：

- 角色萃取
- 簡報風格分析
- 搜尋 Embedding 編碼（選用 Gemini 引擎時）
- 其他文字處理

::: warning 隱私提醒
Google 可能會使用 Free Tier API Key 的輸入與輸出資料來改進其產品與模型。若有隱私疑慮，建議僅使用付費 API Key，或在搜尋功能中選擇 Local 引擎。
:::

## 設定方式

1. 開啟設定面板
2. 展開「進階 API 設定」
3. 分別輸入兩組 Key

## 自動切換邏輯

```
文字處理請求：
  1. 嘗試使用 Free Tier Key
  2. 如果遇到 429 錯誤（免費額度用罄）
  3. 自動切換到付費 Key
  4. 1 小時後重新嘗試 Free Tier Key

圖片/影片生成：
  → 強制使用付費 Key（無 fallback）
```

## 額度狀態

設定面板會顯示每組 Key 是否已設定。

當 Free Tier Key 額度用罄時，系統會自動切換到付費 Key 繼續處理，無需手動干預。1 小時後系統會自動重新嘗試使用 Free Tier Key。

::: info 額度用罄的判斷
系統會根據以下條件判斷額度是否用罄：
- HTTP 狀態碼 429（請求過多）
- 錯誤訊息包含「quota」、「rate limit」、「exhausted」等關鍵字
:::

## 安全性

你的 API Key 儲存在瀏覽器的 localStorage 中：

- **不會**上傳到任何伺服器
- **不會**被其他網站存取
- 清除瀏覽器資料會刪除 Key

::: tip 建議
定期更換 API Key，並在 Google AI Studio 中監控使用量。
:::

## 常見問題

### Q: 一直出現 429 錯誤怎麼辦？

A: 這表示 API 額度已用完。你可以：
1. 等待額度重置（通常是每日或每分鐘）
2. 使用付費帳號
3. 設定雙 Key 模式

### Q: Key 顯示無效？

A: 請確認：
1. Key 是否正確複製（沒有多餘空格）
2. Key 是否已在 Google AI Studio 停用
3. Key 是否有正確的 API 權限

## 下一步

- [快速開始](./getting-started) - 取得第一個 API Key
- [影片生成](./video-generation) - 了解影片生成的計費方式
