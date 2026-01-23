# 快速開始

只需要幾分鐘，你就可以開始使用 Mediator 進行 AI 創作。

## 取得 API Key

Mediator 使用 Google AI Studio 的 API，你需要先取得一個免費的 API Key。

### 步驟 1：前往 Google AI Studio

1. 開啟 [Google AI Studio](https://aistudio.google.com/)
2. 使用你的 Google 帳號登入

### 步驟 2：建立 API Key

1. 點擊左側選單的「Get API key」
2. 點擊「Create API key」
3. 選擇一個 Google Cloud 專案（或建立新專案）
4. 複製產生的 API Key

::: danger 需要綁定付費帳戶
Mediator 使用 Gemini 3 Pro Image（gemini-3-pro-image-preview）進行圖片生成，此模型沒有免費額度，需要在 Google Cloud 專案中啟用 Billing（付費帳戶）才能使用。

設定方式：

1. 前往 [Google Cloud Console](https://console.cloud.google.com/billing)
2. 為你的專案啟用 Billing
3. 綁定信用卡或其他付款方式

建議設定預算上限以避免意外費用。
:::

::: warning 注意
請妥善保管你的 API Key，不要分享給他人或公開在網路上。
:::

### 步驟 3：在 Mediator 中設定

1. 開啟 Mediator 應用程式
2. 在「API Key」欄位貼上你的 Key
3. 點擊「Save API Key」儲存

![API Key 設定畫面](/images/api-key-setup.webp)

## 你的第一張圖片

設定好 API Key 後，讓我們來生成第一張圖片：

1. 確認模式為「生成」（Generate，預設）
2. 在提示詞輸入框輸入描述，例如：

```
一隻可愛的橘貓坐在窗台上，陽光灑落
```

3. 點擊「開始生成」按鈕
4. 等待幾秒鐘，你的圖片就會出現！

![生成結果範例](/images/generation-result.webp)

生成完成後，圖片會顯示在「生成結果」區域，你可以點擊圖片開啟燈箱檢視與下載。所有生成紀錄會自動儲存到左側的「歷史紀錄」面板。

更多詳細的介面說明請參閱 [生成模式](./image-generation)。

## 雙 API Key 模式（進階）

如果你有付費帳號，可以設定兩組 API Key：

- **主要 Key**：用於圖片和影片生成（消耗較多額度）
- **Free Tier Key**：用於文字處理（角色萃取、風格分析、簡報風格生成、簡報內容生成）

這樣可以節省付費額度的消耗。詳見 [API Key 管理](./api-key-management)。

## 下一步

- [圖片生成](./image-generation) - 了解更多生成選項
- [貼圖生成](./sticker-generation) - 製作專屬貼圖
- [影片生成](./video-generation) - 使用 Veo 3.1 生成影片
