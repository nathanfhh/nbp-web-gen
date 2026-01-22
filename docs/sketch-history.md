# Sketch Canvas History 管理規範

## 需求

| 需求 | 說明 |
|------|------|
| 歷程保留 | 編輯後關閉，再次編輯**同一張圖片**時，歷程保留，可繼續 undo/redo |
| 跨圖片重置 | 編輯**不同圖片**時，歷程重置 |
| 新建手繪 | 新建手繪保存後，歷程綁定到新建的圖片 |
| 無多餘快照 | 載入時不產生多餘的初始快照（避免 undo 回到空白） |
| 背景圖片保留 | undo/redo 時背景圖片不消失 |
| 記憶體存儲 | 歷程存在 Pinia store（RAM），頁面重整消失 |

---

## 架構

```
┌─────────────────────────────────────────────────────────┐
│                 generator.js (Pinia Store)               │
│  ┌─────────────────────────────────────────────────┐    │
│  │ sketchHistory: []           ← JSON snapshots    │    │
│  │ sketchHistoryIndex: -1      ← 當前位置          │    │
│  │ sketchEditingImageIndex     ← 正在編輯的圖片idx │    │
│  │ hasSketchHistory (computed) ← 是否有歷程        │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
                            ▲
                            │ storeToRefs (保持響應式)
                            │
┌───────────────────────────┴───────────────────────┐
│              useSketchHistory.js                  │
│  - saveSnapshot()  ← path:created 後呼叫          │
│  - undo() / redo()                                │
│  - canUndo / canRedo (computed)                   │
└───────────────────────────────────────────────────┘
                            ▲
┌───────────────────────────┴───────────────────────┐
│              useSketchCanvas.js                   │
│  - initCanvas({ skipInitialSnapshot })            │
│  - loadFromJson(..., { skipSnapshot })            │
│  - loadImageAsBackground(..., { skipSnapshot })   │
└───────────────────────────────────────────────────┘
```

---

## 關鍵流程

### 1. 新建手繪

```
openSketchCanvas()
  → store.startSketchEdit(-1)      // index = -1 表示新建
  → initCanvas({ skipInitialSnapshot: false })
  → saveSnapshot()                 // 保存空白畫布作為初始狀態

用戶畫筆 → path:created → saveSnapshot()
歷程: [空白, 筆畫1, 筆畫2]

handleSketchSave()
  → store.addReferenceImage()
  → store.setSketchEditingImageIndex(newIndex)  // ⚠️ 關鍵：綁定到新圖片
```

### 2. 再次編輯同一張圖片

```
editImage(index)
  → store.startSketchEdit(index)
  → index === sketchEditingImageIndex → 歷程保留 ✓

initCanvas({ skipInitialSnapshot: true })  // ⚠️ 跳過

loadFromJson(..., { skipSnapshot: store.hasSketchHistory })
  → hasSketchHistory = true → 不添加快照 ✓

歷程維持: [空白, 筆畫1, 筆畫2]
undo → 回到筆畫1 ✓
```

### 3. 編輯不同圖片

```
editImage(differentIndex)
  → store.startSketchEdit(differentIndex)
  → differentIndex !== sketchEditingImageIndex → 歷程重置

initCanvas({ skipInitialSnapshot: true })

loadFromJson/loadImageAsBackground(..., { skipSnapshot: false })
  → hasSketchHistory = false → 保存初始快照

歷程: [初始狀態]
```

---

## 實作檢查清單

### Store (generator.js)

- [ ] `sketchHistory: ref([])`
- [ ] `sketchHistoryIndex: ref(-1)`
- [ ] `sketchEditingImageIndex: ref(null)`
- [ ] `hasSketchHistory: computed(() => sketchHistory.value.length > 0)`
- [ ] `startSketchEdit(index)`: index 相同保留歷程，不同則重置
- [ ] `setSketchEditingImageIndex(index)`: 更新正在編輯的圖片 index

### useSketchHistory.js

- [ ] 使用 `storeToRefs` 獲取響應式引用（不是直接 `store.xxx`）
- [ ] `saveSnapshot()` 使用 `canvas.toJSON(['backgroundImage'])` 保留背景圖

### useSketchCanvas.js

- [ ] `initCanvas({ skipInitialSnapshot })`: 編輯模式跳過初始快照
- [ ] `loadFromJson(..., { skipSnapshot })`: 有歷程時跳過
- [ ] `loadImageAsBackground(..., { skipSnapshot })`: 有歷程時跳過

### ImageUploader.vue

- [ ] `openSketchCanvas()`: 呼叫 `store.startSketchEdit(-1)`
- [ ] `editImage(index)`: 呼叫 `store.startSketchEdit(index)`
- [ ] `handleSketchSave()`: 新建時呼叫 `store.setSketchEditingImageIndex(newIndex)`

### SketchCanvas.vue

- [ ] 判斷 `isEditMode` 決定 `skipInitialSnapshot`
- [ ] 使用 `store.hasSketchHistory` 決定 `skipSnapshot`

---

## 常見錯誤

| 錯誤 | 原因 | 修正 |
|------|------|------|
| Undo 第一下沒反應 | 載入時多 push 一個快照 | 檢查 `skipSnapshot` 邏輯 |
| Undo 回到空白 | `initCanvas` 沒跳過初始快照 | 檢查 `skipInitialSnapshot` |
| 背景圖 undo 後消失 | `toJSON()` 沒包含 `backgroundImage` | 使用 `toJSON(['backgroundImage'])` |
| 歷程沒保留 | `startSketchEdit` index 不匹配 | 檢查 `setSketchEditingImageIndex` |
| computed 不響應 | 直接用 `store.xxx` 而非 `storeToRefs` | 使用 `storeToRefs(store)` |
