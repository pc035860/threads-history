# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Threads Logger 是一個 Chrome Extension (Manifest V3)，自動記錄使用者在 Threads.com 瀏覽過的貼文。

## Build Commands

```bash
bun install          # 安裝依賴
bun run build        # 建置到 dist/（需載入 chrome://extensions）
bun run dev          # 同 build，附帶提示訊息
bun test             # 執行測試（使用 bun:test）
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
                    (LRU, 1000 posts max)
```

### Content Script (`src/content/`)
- **observers.ts**: MutationObserver 監聽 DOM 變化 + IntersectionObserver 偵測貼文進入視窗
- **post-extractor.ts**: 從 DOM 提取貼文資料（作者、內容、互動數），需處理引用區塊排除邏輯

### Storage (`src/storage/`)
- **lru-storage.ts**: LRU 策略，重複瀏覽的貼文會更新 seenAt 並移到最前面
- 使用 `chrome.storage.local`，key: `threads_posts`

### Popup UI (`src/popup/`)
- React 19 + Tailwind CSS 4 + @tanstack/react-virtual（虛擬滾動）
- Hooks: `usePostStorage`（讀取/清除貼文）、`useSearch`（即時搜尋）

### Shared (`src/shared/constants.ts`)
- DOM selectors、MAX_POSTS 上限等常數

## Development Notes

- 使用 Bun 作為 runtime 和 bundler（不使用 Vite/Webpack）
- build.ts 處理：TypeScript 編譯、Tailwind CSS 處理、複製 manifest 和 icons
- 沒有 HMR，修改後需重新 build 並在 Chrome 重新載入 extension
