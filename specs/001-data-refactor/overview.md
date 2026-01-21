# Threads Logger - IndexedDB Migration Implementation Plan

## Overview

將 Threads Logger Chrome Extension 的儲存層從 `chrome.storage.local` 遷移到 **IndexedDB**，並引入 **Background Service Worker** 來統一管理資料操作。此遷移解決了 popup 在 1000+ 篇貼文時啟動緩慢的問題，並為未來的「無限制儲存」功能打下基礎。

### 核心目標

1. **解決效能問題**：Popup 啟動時間從 1.5-2 秒降至 < 500ms
2. **支援大容量儲存**：從實用上限 5000 篇提升到無限制（受硬碟空間限制）
3. **保持功能完整**：LRU 策略、搜尋、匯出、i18n、深色模式等功能不變
4. **安全遷移資料**：從 chrome.storage.local 無縫遷移到 IndexedDB

### 技術架構變更

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Before (Current)                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Content Script              Popup UI                                 │
│       │                          │                                    │
│       ▼                          ▼                                    │
│  savePosts() ───────────────▶ chrome.storage.local                   │
│  (LRU, maxPosts)             (全部資料一次性載入)                     │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                        After (Target)                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Content Script              Popup UI                                 │
│       │                          │                                    │
│       │        chrome.runtime.sendMessage                           │
│       ├────────────────────────┼───────────────────┐                │
│       │                        │                   │                │
│       ▼                        ▼                   ▼                │
│  (觀察貼文)              (讀取/搜尋)      Background Service Worker   │
│                                             │                        │
│                                             ▼                        │
│                                        IndexedDB                     │
│                                  (idb wrapper, 8.0.x)                │
│                                      │                               │
│                           ┌──────────┴──────────┐                   │
│                           ▼                     ▼                   │
│                      posts                  metadata                  │
│                    (貼文資料)              (元資料)                   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Phase Summary

| Phase | Name | Duration | Key Deliverables |
|-------|------|----------|------------------|
| 1 | Background + Database Foundation | 1 day | Manifest V3 background、IndexedDB schema、idb 整合 |
| 2 | Message Handlers | 0.5 day | CRUD handlers、Payload 驗證、message passing |
| 3 | Content Script Refactor | 0.5 day | 改用 Message Passing 儲存貼文 |
| 4 | Popup Refactor | 1.5 day | Hooks 重構、即時更新機制 |
| 5 | Migration + Testing | 1.5 day | 資料遷移、完整測試驗證 |

**Total Estimated Time**: 5 days

---

## Dependencies

```
Phase 1 (Background + Database)
    │
    ├─────────────────┬─────────────────┐
    │                 │                 │
    ▼                 ▼                 ▼
Phase 2          Phase 3        (可並行)
(Handlers)    (Content Refactor)
    │                 │
    └────────┬────────┘
             ▼
      Phase 4 (Popup Refactor)
             │
             ▼
      Phase 5 (Migration + Testing)
```

**依賴說明**：
- Phase 2 依賴 Phase 1（需要 database layer）
- Phase 3 僅依賴 Phase 1（只需要 message types 定義，可與 Phase 2 並行）
- Phase 4 依賴 Phase 2（需要 handlers）
- Phase 5 最後執行（需要所有功能完成後驗證）

---

## Session Strategy

建議的 session 分組：

| Session | Phases | Focus |
|---------|--------|-------|
| 1 | Phase 1 | Background Service Worker 和 Database 基礎建置 |
| 2 | Phase 2 + 3 | Message Handlers 和 Content Script 重構（可並行） |
| 3 | Phase 4 | Popup Hooks 重構（較複雜，需單獨 session） |
| 4 | Phase 5 | Migration 實作和完整測試驗證 |

---

## Verification Criteria

整個專案完成的成功標準：

### 功能驗證
- [ ] Popup 啟動時間 < 500ms（1000 篇貼文時）
- [ ] Content Script 能正常儲存新貼文
- [ ] Popup 能正常顯示、搜尋、清除貼文
- [ ] LRU 策略正確運作（超過上限時刪除最舊的）
- [ ] 匯出功能正常（JSON/CSV）

### 資料遷移驗證
- [ ] 舊資料正確遷移到 IndexedDB（數量匹配）
- [ ] 遷移失敗時保留 chrome.storage.local 資料
- [ ] 遷移成功後清除舊資料

### 安全性驗證
- [ ] Post ID 格式驗證正確
- [ ] URL 域名驗證（僅允許 threads.com）
- [ ] Message 來源驗證正確
- [ ] Payload 結構驗證正確

### 效能驗證
- [ ] Upsert 操作 < 30ms
- [ ] 搜尋操作 < 80ms（1000 篇）
- [ ] Service Worker 正確管理 DB 連線

### 相容性驗證
- [ ] i18n 繁體中文/英文正常
- [ ] 深色模式正常
- [ ] 虛擬滾動正常

---

## Risk Management

| 風險 | 影響 | 緩解措施 |
|------|------|----------|
| IndexedDB 不相容 | 高 | Phase 1 完整測試，確認 Service Worker 可正常運作 |
| Migration 資料遺失 | 高 | 驗證寫入成功後才刪除舊資料，失敗時保留 |
| Popup 響應式更新失效 | 中 | Phase 4 實作完整的 message 通知機制 |
| 搜尋效能退化 | 中 | Phase 5 基準測試，確保效能改善 |

---

## Rollback Plan

如果 IndexedDB 方案出現問題：

1. **保留舊程式碼**：`src/storage/lru-storage.ts` 標記 deprecated 但不刪除
2. **Feature Flag**：`USE_INDEXEDDB` 設定可切換回舊方案
3. **資料保留**：Migration 後 IndexedDB 資料保留，不做自動清除
4. **Hotfix 流程**：發布 hotfix，設定 `USE_INDEXEDDB = false`

---

## Files to Create

```
src/
├── background/
│   ├── index.ts              # NEW - Service Worker 入口
│   ├── db/
│   │   ├── schema.ts         # NEW - IndexedDB Schema
│   │   ├── index.ts          # NEW - Database 初始化
│   │   └── migrations.ts     # NEW - Migration 邏輯
│   └── handlers/
│       ├── post-handler.ts   # NEW - 貼文 CRUD handlers
│       ├── search-handler.ts # NEW - 搜尋 handler
│       └── validator.ts      # NEW - Payload 驗證
├── shared/
│   └── messages.ts           # NEW - Message Passing 型別
└── storage/
    └── lru-storage.ts        # MODIFY - 標記 deprecated

public/
└── manifest.json             # MODIFY - 新增 background.service_worker
```

---

## Related Documents

- **SPEC.md**: 完整技術規格（IndexedDB schema、API 定義、程式碼範例）
- **CLAUDE.md**: 專案架構和開發指南
- **public/manifest.json**: Extension manifest（需新增 background 欄位）
