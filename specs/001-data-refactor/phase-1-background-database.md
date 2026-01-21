# Phase 1: Background + Database Foundation

## Goal

建立 Background Service Worker 和 IndexedDB 資料庫層，作為整個遷移的基礎設施。

## Prerequisites

- [x] SPEC.md 已完成
- [ ] `bun install idb` 已執行

## Tasks

### 1.1 安裝依賴

- [ ] 執行 `bun add idb`
- [ ] 確認 `package.json` 中 `idb` 版本為 8.0.x

### 1.2 更新 Manifest

- [ ] 修改 `public/manifest.json`，新增 background service worker

**修改 `public/manifest.json`**：
```json
{
  "manifest_version": 3,
  "background": {
    "service_worker": "background/index.js",
    "type": "module"
  }
}
```

### 1.3 建立 Shared Message Types

- [ ] 建立 `src/shared/messages.ts`

**檔案：`src/shared/messages.ts`**
```typescript
import type { ThreadPost, ThreadsSettings } from '../background/db/schema.ts';

export type MessageRequest =
  | { type: 'POST_UPSERT'; payload: ThreadPost }
  | { type: 'POST_GET_ALL'; payload?: { limit?: number } }
  | { type: 'POST_SEARCH'; payload: { query: string; limit?: number } }
  | { type: 'POST_CLEAR' }
  | { type: 'POST_GET_COUNT' }
  | { type: 'SETTINGS_GET' }
  | { type: 'SETTINGS_SET'; payload: Partial<ThreadsSettings> };

export type MessageResponse =
  | { success: true; data: ThreadPost[] }
  | { success: true; data: ThreadPost }
  | { success: true; data: number }
  | { success: true; data: ThreadsSettings }
  | { success: true }
  | { success: false; error: string };
```

### 1.4 建立 Database Schema

- [ ] 建立 `src/background/db/schema.ts`

**檔案：`src/background/db/schema.ts`**
```typescript
import type { DBSchema } from 'idb';

export interface ThreadPost {
  id: string;
  url: string;
  author: string;
  content: string;
  likes: number;
  replies: number;
  reposts: number;
  shares: number;
  seenAt: number;
}

export interface ThreadsSettings {
  maxPosts: number;
}

export interface ThreadsLoggerDB extends DBSchema {
  posts: {
    key: string;
    value: ThreadPost;
    indexes: {
      'by-seenAt': number;
      'by-author': string;
    };
  };

  metadata: {
    key: string;
    value: {
      version: number;
      totalPosts: number;
      lastMigrationAt: number;
    };
  };
}
```

### 1.5 建立 Database 初始化

- [ ] 建立 `src/background/db/index.ts`

**檔案：`src/background/db/index.ts`**
```typescript
import { openDB, type IDBPDatabase } from 'idb';
import type { ThreadsLoggerDB } from './schema.ts';

const DB_NAME = 'ThreadsLoggerDB';
const DB_VERSION = 1;

let dbInstance: IDBPDatabase<ThreadsLoggerDB> | null = null;

export async function getDB(): Promise<IDBPDatabase<ThreadsLoggerDB>> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<ThreadsLoggerDB>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion, newVersion, transaction) {
      if (oldVersion < 1) {
        const postsStore = db.createObjectStore('posts', { keyPath: 'id' });
        postsStore.createIndex('by-seenAt', 'seenAt');
        postsStore.createIndex('by-author', 'author');

        const metadataStore = db.createObjectStore('metadata');
        metadataStore.put({
          key: 'info',
          version: 1,
          totalPosts: 0,
          lastMigrationAt: Date.now()
        }, 'info');
      }
    },
    blocked() {
      console.warn('[DB] Upgrade blocked by another tab');
    },
    blocking() {
      console.warn('[DB] This tab is blocking upgrade');
    }
  });

  return dbInstance;
}

// Service Worker 終止時關閉連線
self.addEventListener('beforeunload', () => {
  dbInstance?.close();
  dbInstance = null;
});
```

### 1.6 建立 Migration 模組（基本結構）

- [ ] 建立 `src/background/db/migrations.ts`

**檔案：`src/background/db/migrations.ts`**
```typescript
import { getDB } from './index.ts';

const MIGRATION_KEY = 'indexeddb_migration_complete';

export async function migrateFromLegacyStorage(): Promise<boolean> {
  const result = await chrome.storage.local.get(MIGRATION_KEY);
  if (result[MIGRATION_KEY]) {
    return true;
  }

  // TODO: Phase 5 實作完整遷移邏輯
  console.log('[Migration] Migration logic to be implemented in Phase 5');
  return false;
}
```

### 1.7 建立 Background Service Worker 入口

- [ ] 建立 `src/background/index.ts`

**檔案：`src/background/index.ts`**
```typescript
import { getDB } from './db/index.ts';
import type { MessageRequest, MessageResponse } from '../../shared/messages.ts';
import type { ThreadPost, ThreadsSettings } from './db/schema.ts';
import type { IDBPDatabase } from 'idb';

chrome.runtime.onMessage.addListener(
  (request: MessageRequest, sender, sendResponse) => {
    handleRequest(request).then(sendResponse);
    return true;
  }
);

async function handleRequest(request: MessageRequest): Promise<MessageResponse> {
  const db = await getDB();

  try {
    switch (request.type) {
      case 'POST_UPSERT': {
        // TODO: Phase 2 實作
        return { success: false, error: 'Not implemented yet' };
      }
      case 'POST_GET_ALL': {
        // TODO: Phase 2 實作
        return { success: false, error: 'Not implemented yet' };
      }
      case 'POST_SEARCH': {
        // TODO: Phase 2 實作
        return { success: false, error: 'Not implemented yet' };
      }
      case 'POST_CLEAR': {
        await db.clear('posts');
        return { success: true };
      }
      case 'POST_GET_COUNT': {
        const count = await db.count('posts');
        return { success: true, data: count };
      }
      case 'SETTINGS_GET': {
        const result = await chrome.storage.local.get('threads_settings');
        return { success: true, data: result.threads_settings };
      }
      case 'SETTINGS_SET': {
        await chrome.storage.local.set({ threads_settings: request.payload });
        return { success: true };
      }
      default: {
        return { success: false, error: 'Unknown message type' };
      }
    }
  } catch (error) {
    return { success: false, error: String(error) };
  }
}
```

### 1.8 更新 Build 配置

- [ ] 修改 `build.ts`，加入 `src/background/` 目錄到建置流程

**修改 `build.ts`**（找到 TypeScript 編譯部分）：
```typescript
// 確保包含 background 目錄
await buildTS({
  entrypoints: ['content/index.ts', 'popup/index.ts', 'background/index.ts'],
  // ... 其他配置
});
```

### 1.9 本地測試

- [ ] 執行 `bun run build`
- [ ] 在 Chrome 中載入 extension
- [ ] 開啟 Service Worker 的 DevTools，確認：
  - [ ] Service Worker 正常啟動
  - [ ] IndexedDB 正常建立（Application → IndexedDB → ThreadsLoggerDB）
  - [ ] `posts` 和 `metadata` 表格正確建立

## Code Examples

### IndexedDB 基礎操作測試

```typescript
// 在 Service Worker Console 測試
const db = await getDB();

// 測試新增
await db.add('posts', {
  id: 'test-1',
  url: 'https://www.threads.com/post/test-1',
  author: 'test_user',
  content: 'Test content',
  likes: 0,
  replies: 0,
  reposts: 0,
  shares: 0,
  seenAt: Date.now()
});

// 測試讀取
const post = await db.get('posts', 'test-1');
console.log('Retrieved post:', post);

// 測試索引
const allPosts = await db.getAllFromIndex('posts', 'by-seenAt');
console.log('All posts:', allPosts);

// 測試計數
const count = await db.count('posts');
console.log('Total posts:', count);
```

## Verification

### Tests to Run

```bash
# 建置
bun run build

# 載入到 Chrome 並手動測試
# 1. chrome://extensions → 開發者模式 → 載入已解壓縮的擴充功能
# 2. 開啟 Service Worker 的 DevTools
# 3. 在 Console 執行上面的測試程式碼
```

### Expected Outcomes

- [ ] `bun run build` 成功執行，無錯誤
- [ ] `dist/background/index.js` 正確生成
- [ ] Chrome 可以載入 extension，無錯誤
- [ ] Service Worker 正常啟動
- [ ] IndexedDB `ThreadsLoggerDB` 正確建立
- [ ] `posts` 表格有 `by-seenAt` 和 `by-author` 索引
- [ ] `metadata` 表格正確建立，包含初始資料

### Service Worker Console 測試結果

- [ ] 測試新增貼文成功
- [ ] 測試讀取貼文成功
- [ ] 測試索引查詢成功
- [ ] 測試計數成功

## Files Created/Modified

**新增檔案**：
- `src/shared/messages.ts` (new)
- `src/background/db/schema.ts` (new)
- `src/background/db/index.ts` (new)
- `src/background/db/migrations.ts` (new - 基本結構)
- `src/background/index.ts` (new - 基本結構)

**修改檔案**：
- `public/manifest.json` (新增 background.service_worker)
- `build.ts` (加入 background 目錄)
- `package.json` (新增 idb 依賴)

## Notes

1. **Service Worker 生命週期**：Service Worker 會在閒置時被 Chrome 終止，這是正常行為。每次有 message 傳入時會重新啟動。

2. **IndexedDB 持久性**：IndexedDB 資料會永久保存，即使 Service Worker 被終止。

3. **DevTools 除錯**：
   - Service Worker 的 Console 在 `chrome://extensions` → Service Worker 連結
   - IndexedDB 在 Application → IndexedDB 中查看

4. **型別匯入**：確保所有相對路徑正確，特別是 `../../shared/messages.ts`

5. **TODO 佔位**：Phase 2 會實作完整的 handler 邏輯，目前只需確保架構正確。
