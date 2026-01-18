# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Threads Logger（脆足跡）是一個 Chrome Extension (Manifest V3)，自動記錄使用者在 Threads.com 瀏覽過的貼文。支援 i18n（英文/繁體中文）、深色模式、資料匯出等功能。

## Build Commands

```bash
bun install          # 安裝依賴
bun run build        # 建置到 dist/（需載入 chrome://extensions）
bun run dev          # 同 build，附帶提示訊息
bun test             # 執行測試（使用 bun:test）
bun run lint         # ESLint 檢查
bun run format       # Prettier 格式化
```

## Architecture

```
Content Script (threads.com)     Popup UI (React)
         ↓                              ↓
   post-extractor.ts              usePostStorage.ts
         ↓                              ↓
     observers.ts                  useSearch.ts
         ↓                              ↓
         └──── chrome.storage.local ────┘
                    (LRU, configurable max)
```

### Content Script (`src/content/`)
- **observers.ts**: MutationObserver 監聽 DOM 變化 + IntersectionObserver 偵測貼文進入視窗
- **post-extractor.ts**: 從 DOM 提取貼文資料（作者、內容、互動數），支援多語言數字解析，需處理引用區塊排除邏輯

### Storage (`src/storage/`)
- **lru-storage.ts**: LRU 策略，重複瀏覽的貼文會更新 seenAt 並移到最前面
- **settings.ts**: 使用者設定（如 maxPosts 上限）
- 使用 `chrome.storage.local`，keys: `threads_posts`、`threads_settings`

### Popup UI (`src/popup/`)
- React 19 + Tailwind CSS 4 + @tanstack/react-virtual（虛擬滾動）
- 支援深色模式（跟隨系統設定）
- **Hooks**:
  - `usePostStorage`：讀取/清除貼文，監聽 storage 變更即時更新
  - `useSearch`：即時搜尋
  - `useSettings`：讀取/儲存使用者設定
  - `useI18n`：多語言翻譯
- **Components**:
  - `SettingsPanel`：調整保留貼文數量
  - `ExportButton`：匯出 JSON/CSV

### i18n (`public/_locales/`)
- 支援 `en`（英文）和 `zh_TW`（繁體中文）
- 使用 Chrome Extension i18n API（`chrome.i18n.getMessage`）

### Shared (`src/shared/constants.ts`)
- DOM selectors、storage keys、DEFAULT_MAX_POSTS (1000) 等常數

## Development Notes

- 使用 Bun 作為 runtime 和 bundler（不使用 Vite/Webpack）
- build.ts 處理：TypeScript 編譯、Tailwind CSS 處理、複製 manifest 和 icons
- 沒有 HMR，修改後需重新 build 並在 Chrome 重新載入 extension
- ESLint + Prettier + Husky pre-commit hooks 確保程式碼品質
