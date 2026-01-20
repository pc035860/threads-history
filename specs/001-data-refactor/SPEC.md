# Threads Logger - Technical Specification (IndexedDB Migration)

## 1. Technology Stack

| Category | Technology | Version | Notes |
|----------|------------|---------|-------|
| **IndexedDB Wrapper** | idb | 8.0.x | Jake Archibald 的輕量級方案，1.19 kB |
| **Runtime** | Bun | Latest | 作為 build tool 和 package manager |
| **Extension** | Chrome Extension | Manifest V3 | Background Service Worker |
| **Frontend** | React | 19 | Popup UI |
| **Language** | TypeScript | 5.x | 強型別支援 |

### 1.1 為什麼選擇 `idb` 而非 Dexie.js？

| 因素 | idb | Dexie.js | 說明 |
|------|-----|----------|------|
| Bundle Size | 1.19 kB | 3.03 MB | Chrome Extension 應盡量精簡 |
| 索引支援 | ✅ | ✅ | 兩者皆支援 |
| TypeScript | ✅ DBSchema | ✅ 裝飾器 | `idb` 的 `DBSchema` 介面更原生 |
| 查詢功能 | ✅ 中等 | ✅ 豐富 | Threads Logger 不需要複雜查詢 |
| 維護狀態 | ✅ 活躍 | ✅ 活躍 | 皆由 Jake Archibald 維護 |

**結論**：`idb` 更適合 Chrome Extension 的輕量化需求，同時提供足夠的索引和查詢功能。

---

## 2. Project Structure

### 2.1 新增檔案結構

```
threads-logger/
├── src/
│   ├── background/
│   │   ├── index.ts              # Background Service Worker 入口
│   │   ├── db/
│   │   │   ├── schema.ts         # IndexedDB Schema 定義
│   │   │   ├── index.ts          # Database 初始化
│   │   │   └── migrations.ts     # Schema 版本升級邏輯
│   │   └── handlers/
│   │       ├── post-handler.ts   # 貼文 CRUD 操作
│   │       └── search-handler.ts # 搜尋查詢操作
│   ├── shared/
│   │   └── messages.ts           # Message Passing 型別定義
│   ├── storage/                  # 保留但標記為 deprecated
│   └── ...
├── public/
│   └── manifest.json             # 新增 background 欄位
└── specs/
    └── SPEC.md
```

### 2.2 修改現有檔案

| 檔案 | 變更類型 | 說明 |
|------|----------|------|
| `src/content/observers.ts` | 修改 | 改用 `chrome.runtime.sendMessage` 儲存貼文 |
| `src/popup/hooks/usePostStorage.ts` | 修改 | 改用 message passing 讀取貼文 |
| `src/popup/hooks/useSearch.ts` | 修改 | 改用 message passing 搜尋貼文 |
| `public/manifest.json` | 修改 | 新增 `background.service_worker` 欄位 |
| `src/storage/lru-storage.ts` | 標記 deprecated | 保留以備 migration |
| `src/storage/settings.ts` | 不變 | 繼續使用 `chrome.storage.local` |

---

## 3. IndexedDB Schema Design

### 3.1 資料模型

```typescript
// src/background/db/schema.ts
import type { DBSchema } from 'idb';

/**
 * ThreadPost - 貼文資料結構
 * 與現有 ThreadPost 介面相容
 */
export interface ThreadPost {
  id: string;          // post ID (from URL)
  url: string;         // 完整連結
  author: string;      // 作者名稱
  content: string;     // 貼文內容
  likes: number;       // 按讚數
  replies: number;     // 回覆數
  reposts: number;     // 轉發數
  shares: number;      // 分享數
  seenAt: number;      // timestamp (milliseconds)
}

/**
 * ThreadsLoggerDB - IndexedDB Schema
 */
export interface ThreadsLoggerDB extends DBSchema {
  /**
   * posts 表格 - 儲存所有瀏覽過的貼文
   *
   * 索引策略：
   * - `by-seenAt`: 按瀏覽時間降序排序（LRU 查詢）
   * - `by-author`: 按作者搜尋
   * - `by-content`: 內容全文搜尋（需要應用層過濾）
   */
  posts: {
    key: string;              // 主鍵：post ID
    value: ThreadPost;        // 值：完整貼文資料
    indexes: {
      'by-seenAt': number;    // 按瀏覽時間索引
      'by-author': string;    // 按作者索引
    };
  };

  /**
   * metadata 表格 - 儲存資料庫元資料
   *
   * 用途：
   * - 記錄 schema 版本
   * - 記錄總貼文數量
   */
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

### 3.2 索引設計說明

| 索引名稱 | 欄位 | 用途 | 查詢範例 |
|----------|------|------|----------|
| `by-seenAt` | `seenAt` | LRU 排序、時間範圍查詢 | `db.getAllFromIndex('posts', 'by-seenAt')` |
| `by-author` | `author` | 按作者搜尋 | `db.getAllFromIndex('posts', 'by-author', IDBKeyRange.only('作者名'))` |

**注意**：內容搜尋（`content`）不建立索引，因為：
1. IndexedDB 不支援全文索引
2. 內容長度不固定，不適合索引
3. 搜尋在應用層用 `getAll()` + `filter()` 實作

---

## 4. Message Passing API Specification

### 4.1 Message Protocol

```typescript
// src/shared/messages.ts
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
  | { success: true; data: number }  // count
  | { success: true; data: ThreadsSettings }
  | { success: true }  // 用於 POST_CLEAR, SETTINGS_SET (無回傳資料)
  | { success: false; error: string };
```

### 4.2 端點定義

| Method | Message Type | Payload | Response | 說明 |
|--------|--------------|---------|----------|------|
| UPSERT | `POST_UPSERT` | `ThreadPost` | `ThreadPost` | 新增或更新貼文（LRU 策略） |
| GET ALL | `POST_GET_ALL` | `{ limit?: number }` | `ThreadPost[]` | 取得所有貼文（可選 limit） |
| SEARCH | `POST_SEARCH` | `{ query: string; limit?: number }` | `ThreadPost[]` | 搜尋貼文（作者/內容） |
| CLEAR | `POST_CLEAR` | - | - | 清空所有貼文 |
| COUNT | `POST_GET_COUNT` | - | `number` | 取得貼文總數 |
| GET SETTINGS | `SETTINGS_GET` | - | `ThreadsSettings` | 取得設定（仍在 storage.local） |
| SET SETTINGS | `SETTINGS_SET` | `Partial<ThreadsSettings>` | - | 更新設定 |

### 4.3 使用範例

```typescript
// Content Script - 儲存貼文
chrome.runtime.sendMessage({
  type: 'POST_UPSERT',
  payload: {
    id: 'post-123',
    url: 'https://threads.com/post/123',
    author: 'zuck',
    content: 'Hello world',
    likes: 100,
    replies: 50,
    reposts: 10,
    shares: 5,
    seenAt: Date.now()
  }
}, (response) => {
  if (response.success) {
    console.log('儲存成功', response.data);
  }
});

// Popup - 讀取貼文
chrome.runtime.sendMessage({
  type: 'POST_GET_ALL',
  payload: { limit: 100 }
}, (response) => {
  if (response.success) {
    setPosts(response.data);
  }
});
```

---

## 5. Code Examples

### 5.1 Database 初始化

```typescript
// src/background/db/index.ts
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { ThreadsLoggerDB } from './schema.ts';

const DB_NAME = 'ThreadsLoggerDB';
const DB_VERSION = 1;

let dbInstance: IDBPDatabase<ThreadsLoggerDB> | null = null;

export async function getDB(): Promise<IDBPDatabase<ThreadsLoggerDB>> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<ThreadsLoggerDB>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion, newVersion, transaction) {
      // 版本 1：初始 schema
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
      // 其他分頁正在使用舊版本
      console.warn('[DB] Upgrade blocked by another tab');
    },
    blocking() {
      // 此分頁正在阻止升級，建議重新載入
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

### 5.2 Background Service Worker - Message Handler

```typescript
// src/background/index.ts
import { getDB } from './db/index.ts';
import type { MessageRequest, MessageResponse } from '../../shared/messages.ts';
import type { ThreadPost, ThreadsSettings } from './db/schema.ts';
import type { IDBPDatabase } from 'idb';
import { getSettings } from '../../storage/settings.ts';  // 或直接使用 chrome.storage.local
import { DEFAULT_MAX_POSTS } from '../../shared/constants.ts';

chrome.runtime.onMessage.addListener(
  (request: MessageRequest, sender, sendResponse) => {
    handleRequest(request).then(sendResponse);
    return true; // 保持 message channel 開啟以支援 async response
  }
);

async function handleRequest(request: MessageRequest): Promise<MessageResponse> {
  const db = await getDB();

  try {
    switch (request.type) {
      case 'POST_UPSERT': {
        return await handleUpsert(db, request.payload);
      }
      case 'POST_GET_ALL': {
        return await handleGetAll(db, request.payload?.limit);
      }
      case 'POST_SEARCH': {
        return await handleSearch(db, request.payload.query, request.payload.limit);
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
        // 仍然使用 chrome.storage.local
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

async function handleUpsert(
  db: IDBPDatabase<ThreadsLoggerDB>,
  post: ThreadPost
): Promise<MessageResponse> {
  // LRU 策略：檢查是否已存在
  const existing = await db.get('posts', post.id);

  if (existing) {
    // 更新 seenAt 並移到最新
    await db.put('posts', { ...existing, seenAt: Date.now() });
  } else {
    // 新增貼文
    await db.add('posts', { ...post, seenAt: Date.now() });

    // 檢查是否超過上限
    const settings = await getSettings();
    const maxPosts = settings.maxPosts ?? DEFAULT_MAX_POSTS;
    const count = await db.count('posts');

    if (count > maxPosts) {
      // 使用 cursor 直接刪除最舊的 N 筆記錄（更有效率）
      const toDelete = count - maxPosts;
      const tx = db.transaction('posts', 'readwrite');
      const index = tx.store.index('by-seenAt');
      let deleted = 0;

      for await (const cursor of index.iterate()) {
        if (deleted < toDelete) {
          await cursor.delete();
          deleted++;
        } else {
          break;
        }
      }

      await tx.done;  // 確保 transaction 完成
    }
  }

  return { success: true, data: post };
}

async function handleGetAll(
  db: IDBPDatabase<ThreadsLoggerDB>,
  limit?: number
): Promise<MessageResponse> {
  // 按_seenAt 降序取得貼文
  let posts = await db.getAllFromIndex('posts', 'by-seenAt');

  // 降序排序（最新的在前）
  posts.sort((a, b) => b.seenAt - a.seenAt);

  if (limit) {
    posts = posts.slice(0, limit);
  }

  return { success: true, data: posts };
}

async function handleSearch(
  db: IDBPDatabase<ThreadsLoggerDB>,
  query: string,
  limit?: number
): Promise<MessageResponse> {
  const allPosts = await db.getAll('posts');
  const keywords = query.toLowerCase().split(/\s+/);

  // 多關鍵字 AND 邏輯
  const filtered = allPosts.filter(post =>
    keywords.every(keyword =>
      post.author.toLowerCase().includes(keyword) ||
      post.content.toLowerCase().includes(keyword)
    )
  );

  // 按 seenAt 降序排序
  filtered.sort((a, b) => b.seenAt - a.seenAt);

  const results = limit ? filtered.slice(0, limit) : filtered;

  return { success: true, data: results };
}
```

### 5.3 Popup Hook - 重構後

```typescript
// src/popup/hooks/usePostStorage.ts (重構版)
import { useState, useEffect } from 'react';
import type { MessageRequest, MessageResponse } from '../../shared/messages.ts';
import type { ThreadPost } from '../../background/db/schema.ts';

function sendMessage<T = unknown>(request: MessageRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(request, (response: MessageResponse) => {
      if (response.success) {
        resolve(response.data as T);
      } else {
        reject(new Error(response.error));
      }
    });
  });
}

export function usePostStorage() {
  const [posts, setPosts] = useState<ThreadPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    sendMessage<ThreadPost[]>({ type: 'POST_GET_ALL' })
      .then(data => {
        if (mounted) {
          setPosts(data);
        }
      })
      .catch(err => console.error('Failed to load posts:', err))
      .finally(() => {
        if (mounted) setLoading(false);
      });

    // 監聽背景更新（透過自訂事件）
    const handleStorageUpdate = () => {
      sendMessage<ThreadPost[]>({ type: 'POST_GET_ALL' })
        .then(data => mounted && setPosts(data));
    };

    chrome.runtime.onMessage.addListener((message: MessageRequest) => {
      if (message.type === 'POST_UPSERT') {
        handleStorageUpdate();
      }
    });

    return () => {
      mounted = false;
    };
  }, []);

  const clearPosts = async () => {
    await sendMessage({ type: 'POST_CLEAR' });
    setPosts([]);
  };

  return { posts, loading, clearPosts };
}
```

### 5.4 Manifest V3 - Background Service Worker

```json
// public/manifest.json (新增部分)
{
  "manifest_version": 3,
  "background": {
    "service_worker": "background/index.js",
    "type": "module"
  },
  "permissions": ["storage"]
}
```

---

## 6. Migration Strategy

### 6.1 資料遷移流程

```
┌─────────────────────────────────────────────────────────────┐
│                    Migration Flow                            │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. Extension 更新                                           │
│     ├─ 檢測舊 chrome.storage.local 資料                     │
│     ├─ 建立 IndexedDB                                       │
│     └─ 執行一次性遷移                                       │
│                                                              │
│  2. 遷移完成後                                               │
│     ├─ 清除 chrome.storage.local 舊資料                     │
│     └─ 標記 migration_complete                              │
│                                                              │
│  3. 降級處理（Rollback）                                     │
│     └─ IndexedDB 資料保留，不做自動清除                     │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 6.2 Migration 程式碼

```typescript
// src/background/db/migrations.ts
import { getDB } from './index.ts';
import { loadPosts as loadFromOldStorage } from '../../storage/lru-storage.ts';

const MIGRATION_KEY = 'indexeddb_migration_complete';

export async function migrateFromLegacyStorage(): Promise<boolean> {
  // 檢查是否已遷移
  const result = await chrome.storage.local.get(MIGRATION_KEY);
  if (result[MIGRATION_KEY]) {
    return true; // 已遷移
  }

  try {
    // 從舊儲存讀取
    const oldPosts = await loadFromOldStorage();

    if (oldPosts.length === 0) {
      // 沒有舊資料，標記完成
      await chrome.storage.local.set({ [MIGRATION_KEY]: true });
      return true;
    }

    // 寫入 IndexedDB
    const db = await getDB();
    const tx = db.transaction('posts', 'readwrite');

    for (const post of oldPosts) {
      await tx.store.put(post);
    }

    await tx.done;

    // 驗證寫入成功再清除舊資料
    const migratedCount = await db.count('posts');
    if (migratedCount === oldPosts.length) {
      // 驗證成功，清除舊資料並標記完成
      await chrome.storage.local.remove('threads_posts');
      await chrome.storage.local.set({ [MIGRATION_KEY]: true });
      console.log(`[Migration] 遷移了 ${migratedCount} 篇貼文到 IndexedDB`);
      return true;
    } else {
      // 驗證失敗，保留舊資料
      throw new Error(`Migration count mismatch: expected ${oldPosts.length}, got ${migratedCount}`);
    }
  } catch (error) {
    console.error('[Migration] 遷移失敗:', error);
    // 失敗時保留舊資料，不做刪除
    return false;
  }
}
```

### 6.3 Migration 觸發時機

```typescript
// src/background/index.ts (加入 migration 邏輯)
chrome.runtime.onStartup.addListener(async () => {
  await migrateFromLegacyStorage();
});

chrome.runtime.onInstalled.addListener(async () => {
  await migrateFromLegacyStorage();
});
```

---

## 7. Security Considerations

### 7.1 資料驗證

| 驗證項目 | 實作方式 |
|----------|----------|
| Post ID 格式 | `id` 必須符合 `^[A-Za-z0-9\-_]+$` 且非空 |
| URL 格式 | 必須來自 `https://www.threads.com` 域名 |
| 數值範圍 | `likes`, `replies` 等必須 ≥ 0 |
| 內容長度 | 限制 `content` 最大長度（10000 字元） |
| 作者名稱 | 限制最大長度（100 字元），避免注入特殊字元 |

```typescript
// src/background/handlers/validator.ts
export function isValidPostPayload(payload: unknown): payload is ThreadPost {
  if (!payload || typeof payload !== 'object') return false;
  const post = payload as Partial<ThreadPost>;

  return (
    typeof post.id === 'string' &&
    /^[A-Za-z0-9\-_]+$/.test(post.id) &&
    typeof post.url === 'string' &&
    post.url.startsWith('https://www.threads.com/') &&
    typeof post.content === 'string' &&
    post.content.length <= 10000 &&
    typeof post.author === 'string' &&
    post.author.length <= 100 &&
    typeof post.likes === 'number' && post.likes >= 0 &&
    typeof post.replies === 'number' && post.replies >= 0 &&
    typeof post.reposts === 'number' && post.reposts >= 0 &&
    typeof post.shares === 'number' && post.shares >= 0 &&
    typeof post.seenAt === 'number' && post.seenAt > 0
  );
}
```

### 7.2 Message Passing 安全

```typescript
// src/background/index.ts
import type { MessageSender } from '@types/chrome';

// 驗證 message 來源（僅允許自己的 extension）
function isValidMessage(sender: MessageSender): boolean {
  return sender.id === chrome.runtime.id;
}

// 驗證 payload 結構
function isValidRequest(request: unknown): request is MessageRequest {
  if (!request || typeof request !== 'object') return false;
  const req = request as Partial<MessageRequest>;
  return (
    typeof req.type === 'string' &&
    ['POST_UPSERT', 'POST_GET_ALL', 'POST_SEARCH', 'POST_CLEAR',
     'POST_GET_COUNT', 'SETTINGS_GET', 'SETTINGS_SET'].includes(req.type)
  );
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (!isValidMessage(sender)) {
    sendResponse({ success: false, error: 'Unauthorized' });
    return false;
  }

  if (!isValidRequest(request)) {
    sendResponse({ success: false, error: 'Invalid request' });
    return false;
  }

  // 額外驗證 POST_UPSERT 的 payload
  if (request.type === 'POST_UPSERT' && !isValidPostPayload(request.payload)) {
    sendResponse({ success: false, error: 'Invalid payload' });
    return false;
  }

  handleRequest(request).then(sendResponse);
  return true;
});
```

### 7.3 錯誤處理

- 所有 IndexedDB 操作包裹在 `try-catch` 中
- Message handler 返回標準化的 `MessageResponse` 格式
- 關鍵錯誤記錄到 `console.error` 供開發者除錯

---

## 8. Performance Considerations

### 8.0 Performance Baseline and Goals

| 指標 | 目前（chrome.storage.local） | 目標（IndexedDB） |
|------|-----------------------------|-------------------|
| Popup 啟動時間（1000 篇） | ~1.5-2 秒 | < 500ms |
| Upsert 操作時間 | ~50ms | < 30ms |
| 搜尋時間（1000 篇） | ~100ms | < 80ms |
| 支援最大數量 | ~5000 實用上限 | 無限制（受硬碟空間限制） |

**問題分析**：
- `chrome.storage.local` 在 popup 載入時會預先分配資源，導致啟動延遲
- 大量資料（1000+ 篇）的 JSON 解析和傳輸成為瓶頸
- IndexedDB 非同步載入可避免阻塞 UI

### 8.1 批次操作優化

```typescript
// 不好的做法：多次 await
for (const post of posts) {
  await db.add('posts', post); // 每次 transaction
}

// 好的做法：單一 transaction
const tx = db.transaction('posts', 'readwrite');
await Promise.all(posts.map(post => tx.store.add(post)));
await tx.done;
```

### 8.2 分頁載入（Lazy Loading）

```typescript
// Background 提供 cursor-based pagination
async function getPaginatedPosts(page: number, pageSize: number) {
  const db = await getDB();
  const allPosts = await db.getAllFromIndex('posts', 'by-seenAt');
  allPosts.sort((a, b) => b.seenAt - a.seenAt);

  const start = page * pageSize;
  const end = start + pageSize;

  return {
    posts: allPosts.slice(start, end),
    hasMore: end < allPosts.length,
    totalCount: allPosts.length
  };
}
```

### 8.3 記憶體管理

- Service Worker 會在閒置時被終止，IndexedDB 連線會自動關閉
- Popup 關閉時釋放 React 狀態
- 使用虛擬滾動（`@tanstack/react-virtual`）減少 DOM 節點

---

## 9. Testing Strategy

### 9.1 單元測試

| 測試目標 | 檔案 | 工具 |
|----------|------|------|
| Database 初始化 | `db/index.test.ts` | `fake-indexeddb` |
| Message Handler | `background/index.test.ts` | `bun:test` |
| Migration Logic | `db/migrations.test.ts` | `fake-indexeddb` |

### 9.2 整合測試

```typescript
// 使用 fake-indexeddb 模擬 IndexedDB
import 'fake-indexeddb/auto';
import { getDB } from '../db/index.ts';

test('should store and retrieve posts', async () => {
  const db = await getDB();
  const post = { /* ... */ };

  await db.add('posts', post);
  const retrieved = await db.get('posts', post.id);

  expect(retrieved).toEqual(post);
});
```

### 9.3 E2E 測試

- 在 Chrome Extension 環境中測試完整的 message passing 流程
- 驗證 migration 從 chrome.storage.local 到 IndexedDB

---

## 10. Deployment Checklist

### 10.1 建置前

- [ ] 更新 `manifest.json` 新增 `background.service_worker`
- [ ] 執行 `bun install idb`
- [ ] 更新 `build.ts` 包含 `src/background/` 目錄

### 10.2 測試

- [ ] 單元測試通過：`bun test`
- [ ] 在 Chrome 中載入 extension 測試
- [ ] 驗證 migration 功能（如果有舊資料）
- [ ] 驗證 popup 正常顯示貼文
- [ ] 驗證 content script 正常儲存貼文

### 10.3 發布

- [ ] 更新版本號（`manifest.json`）
- [ ] 更新 CHANGELOG.md
- [ ] 上傳到 Chrome Web Store

---

## 11. Rollback Plan

如果 IndexedDB 方案出現問題：

1. **保留舊程式碼**：`src/storage/lru-storage.ts` 標記為 deprecated 但不刪除
2. **Feature Flag**：新增 `USE_INDEXEDDB` 設定，可切換回舊方案
3. **資料不刪除**：Migration 完成後保留 IndexedDB 資料，不做自動清除

---

## 12. Future Enhancements

### 12.1 「無限制儲存」具體實作策略

**Phase 1（此次遷移）：**
- 保持現有設定介面（100-10000 篇）
- IndexedDB 可支援更大容量，但 UI 暫不開放無限制選項
- 設定驗證：`maxPosts` 上限 10000

**Phase 2（未來擴展）：**
- 新增「無限制」選項（移除上限，設定為 `0` 或 `Infinity`）
- 新增儲存空間使用量顯示：
  ```typescript
  // 使用 Storage Estimation API
  const estimate = await navigator.storage.estimate();
  const usage = estimate.usage || 0;
  const quota = estimate.quota || 0;
  const percentage = (usage / quota) * 100;
  ```
- 新增手動清理舊貼文功能（按日期範圍刪除）
- 當空間不足時顯示警告提示

**Phase 3（進階功能）：**
- 自動清理策略：當達到 80% 硬碟空間時自動刪除最舊的 10%
- 資料壓縮：對內容過長的貼文進行截斷並標記
- 分級儲存：熱資料（最近 1000 篇）在 IndexedDB，冷資料壓縮存儲

### 12.2 可能的後續優化

| 功能 | 說明 | 優先級 |
|------|------|--------|
| 全文搜尋 | 使用 FlexSearch 或 Lunr.js | 低 |
| 響應式更新 | 使用 `useLiveQuery` 模式 | 中 |
| 資料匯入/匯出 | 支援從 JSON 匯入 | 低 |
| 自動備份 | 定期備份到 Google Drive | 低 |

### 12.3 Schema 變更預留

未來可能新增的欄位：
- `tags: string[]` - 貼文標籤
- `isBookmarked: boolean` - 收藏狀態
- `notes: string` - 使用者筆記

---

## Appendix A: `idb` API 參考

### 常用方法

```typescript
import { openDB } from 'idb';

// 開啟資料庫
const db = await openDB<ThreadsLoggerDB>('MyDB', 1, {
  upgrade(db) { /* schema 定義 */ }
});

// 新增
await db.add('posts', post);

// 取得
await db.get('posts', 'post-id');

// 更新
await db.put('posts', updatedPost);

// 刪除
await db.delete('posts', 'post-id');

// 查詢索引
await db.getAllFromIndex('posts', 'by-seenAt');

// 範圍查詢
await db.getAllFromIndex(
  'posts',
  'by-seenAt',
  IDBKeyRange.lowerBound(Date.now() - 86400000)
);

// 計數
await db.count('posts');

// 清空
await db.clear('posts');
```

---

## Appendix B: Chrome Extension Storage vs IndexedDB

| 特性 | chrome.storage.local | IndexedDB |
|------|---------------------|-----------|
| 容量 | ~5MB (可擴充) | 硬碟空間 |
| 同步 | 雲端同步 (storage.sync) | 無 |
| API | Promise-based | Event-based |
| 索引 | 無 | 有 |
| 查詢 | 無 | 有 |
| Transaction | 無 | 有 |
| 適用 | 設定、小型資料 | 大量資料、複雜查詢 |

**Threads Logger 策略**：
- **設定**：繼續用 `chrome.storage.local`（需要跨設備同步）
- **貼文**：改用 IndexedDB（大量資料，需要索引和查詢）
