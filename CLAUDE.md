# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Threads Logger（脆足跡）是一個 Chrome Extension (Manifest V3)，自動記錄使用者在 Threads.com 瀏覽過的貼文。支援 i18n（英文/繁體中文）、深色模式、資料匯出等功能。

**目標網站**: https://www.threads.com

**最新架構重構**：已從 chrome.storage.local 遷移到 IndexedDB + Message Passing 架構（詳見 `specs/001-data-refactor/`）

## Build Commands

```bash
bun install          # 安裝依賴
bun run build        # 建置到 dist/（需載入 chrome://extensions）
bun run dev          # 同 build，附帶提示訊息
bun test             # 執行測試（使用 bun:test）
bun run typecheck    # TypeScript 型別檢查
bun run lint         # ESLint 檢查
bun run format       # Prettier 格式化

# Release commands
bun run release:patch   # 1.0.0 -> 1.0.1 (bug fixes)
bun run release:minor   # 1.0.0 -> 1.1.0 (new features)
bun run release:major   # 1.0.0 -> 2.0.0 (breaking changes)
bun run release:dry     # 預覽發布變更
```

## Architecture

```
Content Script (threads.com)     Popup UI (React)
         ↓                              ↓
   post-extractor.ts              usePostStorage.ts
         ↓                              ↓
     observers.ts                  useSearch.ts
         ↓                              ↓
   chrome.runtime.sendMessage ───→ chrome.runtime.sendMessage
                                          ↓
                                  Background Service Worker
                                          ↓
                                 src/background/db/index.ts
                                          ↓
                                    IndexedDB (idb)
                        (Posts store + Metadata store, LRU eviction)
```

### Background Service Worker (`src/background/`)
Central message router and IndexedDB orchestrator for all extension components.

- **index.ts**: Service Worker 主入口，註冊 Message Handler 路由
  - 訊息類型驗證 (`isValidMessage`)
  - 錯誤碼區分 (`ErrorCode` enum)
  - 遷移進度標記 (`migrationInProgress`)
  - 設定快取 (`cachedMaxPosts`)
  - 啟動與設定變更時會重新對齊 retention limit
  - Service Worker 生命週期管理（install/activate/keep-alive）
  - 位置：`src/background/index.ts`

- **db/**: IndexedDB 資料庫模組
  - **index.ts**: 資料庫操作介面 (CRUD、搜尋、計數)
    - `openDatabase()` - 開啟/建立資料庫
    - `getAllPosts()` - 取得所有貼文（按 seenAt 降序）
    - `upsertPost()` - 新增/更新貼文（LRU 策略）
    - `searchPosts()` - 關鍵字搜尋（AND 邏輯）
    - `clearPosts()` - 清除所有貼文
    - `getPostCount()` - 取得貼文數量
    - 位置：`src/background/db/index.ts:1-152`
  - **schema.ts**: TypeScript 型別定義（資料庫結構、Store 名稱、Index 名稱）
    - 位置：`src/background/db/schema.ts:1-58`
  - **migrations.ts**: 從 chrome.storage.local 遷移到 IndexedDB
    - `isMigrationNeeded()` - 檢查是否需要遷移
    - `migrateFromStorage()` - 執行批次遷移（失敗保留舊資料）
    - 位置：`src/background/db/migrations.ts:1-198`

- **handlers/**: 訊息處理器
  - **post-handler.ts**: 貼文相關訊息處理
    - `handleUpsert()` - 處理新增/更新貼文請求
    - `enforceMaxPosts()` - 集中執行 retention 裁切
    - `handleGetAll()` - 處理取得所有貼文請求
    - `handleSearch()` - 處理搜尋請求
    - `handleClear()` - 處理清除請求
    - `handleGetCount()` - 處理計數請求
    - 位置：`src/background/handlers/post-handler.ts`
  - **validator.ts**: 訊息驗證與錯誤類別
    - `validateThreadPost()` - 驗證貼文資料格式
    - `ValidationError` - 驗證錯誤類別（非重試錯誤）
    - 位置：`src/background/handlers/validator.ts:1-184`

### Content Script (`src/content/`)
- **observers.ts**: MutationObserver 監聽 DOM 變化 + IntersectionObserver 偵測貼文進入視窗
  - 改用 `chrome.runtime.sendMessage` 與 Background 通訊
  - 實作基於錯誤碼的無限重試邏輯（針對可重試錯誤）
  - 位置：`src/content/observers.ts:1-238`
- **post-extractor.ts**: 從 DOM 提取貼文資料（作者、內容、互動數）
  - 支援多語言數字解析（英文/中文）
  - 需處理引用區塊排除邏輯
  - 位置：`src/content/post-extractor.ts:1-454`

### Popup UI (`src/popup/`)
React 19 + Tailwind CSS 4 + @tanstack/react-virtual（虛擬滾動）

- **Hooks**:
  - `usePostStorage`：透過 `chrome.runtime.sendMessage` 與 Background 通訊
    - `loadPosts()` - 取得貼文列表
    - `clearPosts()` - 清除所有貼文
    - 監聽 `POSTS_UPDATED` 通知即時更新
    - 位置：`src/popup/hooks/usePostStorage.ts:1-58`
  - `useSearch`：即時搜尋（支援多關鍵字 AND 邏輯）
    - 透過 `POST_SEARCH` 訊息類型請求 Background
    - 位置：`src/popup/hooks/useSearch.ts:1-68`
  - `useSettings`：讀取/儲存使用者設定（透過 chrome.storage.local）
    - UI 與儲存都共用 `src/storage/settings.ts` 的正規化邏輯
    - 位置：`src/popup/hooks/useSettings.ts`
  - `useI18n`：多語言翻譯
    - 位置：`src/popup/hooks/useI18n.ts:1-7`

- **Components**:
  - `SearchBar`：搜尋輸入框
  - `PostList`：貼文列表（使用 @tanstack/react-virtual 虛擬滾動）
  - `PostItem`：單一貼文顯示
  - `HighlightedText`：搜尋關鍵字高亮（智慧截取、支援深色模式）
  - `SettingsPanel`：調整保留貼文數量
  - `ExportButton`：匯出 JSON/CSV

- **Utils**:
  - **messaging.ts**: Message Passing 工具函式
    - `sendMessage()` - 傳送訊息到 Background 並處理錯誤回應
    - `isError()` - 檢查回應是否為錯誤（檢查 `code` 欄位）
    - 位置：`src/popup/utils/messaging.ts:1-142`
  - **highlight.ts**：`getSmartSnippet()` 智慧截取、`splitByKeywords()` 關鍵字分割
    - 位置：`src/popup/utils/highlight.ts:1-107`

### Shared (`src/shared/`)
- **messages.ts**: Message Passing 型別定義
  - 訊息類型（discriminated union）：`Message`、`NotificationMessage`
  - 錯誤碼 enum：`ErrorCode` (MIGRATION_IN_PROGRESS, NETWORK_ERROR, VALIDATION_ERROR, INVALID_MESSAGE_FORMAT, UNKNOWN_ERROR)
  - 型別守衛：`isValidMessage()`、`isPostUpsertMessage()` 等
  - 位置：`src/shared/messages.ts:1-145`
- **constants.ts**: DOM selectors、storage keys、retention limit bounds 等常數
  - 位置：`src/shared/constants.ts`
- **debug.ts**: 除錯工具（目前無實作）
- **perf.ts**: 效能監控工具（目前無實作）

### Storage Utilities (`src/storage/`)
- **settings.ts**: 共享設定正規化與 chrome.storage.local 讀寫
- **types.ts**: `ThreadPost` 型別

### Legacy Storage (`src/storage/`)
保留作為 Rollback 計劃與舊測試參考，不應接入目前 production data flow。
- **lru-storage.ts**: 舊版 chrome.storage.local LRU 實作

### Scripts (`scripts/`)
- **release.ts**: Semantic Versioning Release 自動化腳本
  - 自動更新版本號（package.json + manifest.json）
  - 建立 git commit 和 tag
  - 執行 build 並打包到 `packing/chrome-vX.X.X.zip`
  - 支援 `--dry-run` 預覽模式
  - 位置：`scripts/release.ts:1-xxx`

### i18n (`public/_locales/`)
- 支援 `en`（英文）和 `zh_TW`（繁體中文）
- 使用 Chrome Extension i18n API（`chrome.i18n.getMessage`）

## Development Notes

- 使用 Bun 作為 runtime 和 bundler（不使用 Vite/Webpack）
- build.ts 處理：TypeScript 編譯、Tailwind CSS 處理、複製 manifest 和 icons
- **Minify 設定**：JS 不 minify（便於除錯），CSS 保持 minify
- 沒有 HMR，修改後需重新 build 並在 Chrome 重新載入 extension
- ESLint + Prettier + Husky pre-commit hooks 確保程式碼品質
- pre-commit 會執行 `prettier --write`、`eslint --fix`、`tsc-files --noEmit`，commit 前留意 staged 內容可能被自動改寫
- **資料遷移**：首次安裝新版本時會自動從 chrome.storage.local 遷移到 IndexedDB
  - 遷移期間所有請求（除了 `POST_GET_COUNT`）會被阻擋並返回 `MIGRATION_IN_PROGRESS` 錯誤
  - 遷移失敗會保留舊資料，下次重試

## Conventions & Gotchas

- Production 貼文資料只能透過 Background message handlers 讀寫；不要直接把新功能接到 `src/storage/lru-storage.ts`
- `maxPosts` 設定的 canonical normalization 在 `src/storage/settings.ts`；Popup、Background、storage layer 都應共用這份邏輯，不要各自寫 min/max 判斷
- Retention limit 不是只在新貼文寫入時才要考慮；設定變更、migration、service worker 重啟後的既有資料也要能收斂到上限
- Manifest V3 service worker 是短生命週期；任何快取狀態都只能當 optimization，不能當唯一來源

## Recent Significant Changes

- IndexedDB + message passing 已成為正式資料路徑；舊 `chrome.storage.local` LRU 僅保留作回滾與測試參考
- Retention pruning 現在集中在 Background handler，並在設定變更與啟動流程中重新對齊既有資料
- 設定輸入與儲存共用正規化邏輯，避免 UI 顯示值與實際生效值脫鉤

### Release Workflow

專案使用 Semantic Versioning 和自動化發布流程：

1. **版本升級類型**：
   - `patch` (1.0.0 -> 1.0.1): 錯誤修復
   - `minor` (1.0.0 -> 1.1.0): 新功能
   - `major` (1.0.0 -> 2.0.0): 破壞性變更

2. **執行 release**：
   ```bash
   bun run release:patch  # 自動完成所有步驟
   ```

3. **自動執行的步驟**：
   - 更新 `package.json` 和 `public/manifest.json` 版本號
   - 建立 git commit: `chore(release): bump version to X.X.X`
   - 建立 git tag: `vX.X.X`
   - 執行 build 並打包到 `packing/chrome-vX.X.X.zip`

4. **後續步驟**：
   ```bash
   git push origin main
   git push origin v1.0.1
   # 上傳 packing/chrome-v1.0.1.zip 到 Chrome Web Store
   ```

## Key Design Decisions

### Message Passing Architecture
- **為什麼**：Manifest V3 要求 Service Worker 架構，Content Script 和 Popup 無法直接存取 IndexedDB
- **實作**：所有資料操作透過 `chrome.runtime.sendMessage` 傳送到 Background Service Worker
- **錯誤處理**：引入 `ErrorCode` enum 協助 Content Script 判斷是否應重試

### IndexedDB over chrome.storage.local
- **為什麼**：chrome.storage.local 有同步 API 阻塞問題，且不支援複雜查詢
- **實作**：使用 `idb` 套件提供 Promise-based 的型別安全介面
- **索引設計**：`by-seenAt` 索引用於排序，`by-author` 索引用於作者過濾（目前未使用）

### LRU Eviction Strategy
- **實作**：重複瀏覽的貼文會更新 `seenAt` 並移到最前面
- **淘汰**：retention enforcement 會在寫入後、設定變更後與啟動對齊時移除最舊的貼文
- **位置**：`src/background/handlers/post-handler.ts`

### Error Handling & Retry Logic
- **可重試錯誤**：`MIGRATION_IN_PROGRESS`、`NETWORK_ERROR`、`UNKNOWN_ERROR`
- **不可重試錯誤**：`VALIDATION_ERROR`、`INVALID_MESSAGE_FORMAT`
- **Content Script 重試**：`src/content/observers.ts:21-84` 針對可重試錯誤進行無限重試

## Testing

- **單元測試**：使用 `bun:test`
  - `src/popup/hooks/useSearch.test.ts` - Hook 測試（需 Mock `chrome.runtime.sendMessage`）
  - `src/content/post-extractor.test.ts` - 貼文提取測試
  - `src/popup/utils/highlight.test.ts` - 高亮測試
  - `src/storage/settings.test.ts` - 設定正規化測試
  - `src/storage/lru-storage.test.ts` - 舊版 LRU 測試（保留）
  - `src/background/handlers/post-handler.test.ts` - retention 裁切輔助邏輯測試

- **測試時序注意**：Hook 測試需將 `setQuery` 和 `performAutoSearch` 分成兩個 `act()` 執行
