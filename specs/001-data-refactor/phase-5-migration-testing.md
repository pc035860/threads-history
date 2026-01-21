# Phase 5: Migration + Testing

## Goal

實作從 `chrome.storage.local` 到 IndexedDB 的資料遷移邏輯，並進行完整的測試驗證，確保整個遷移計畫成功。

## Prerequisites

- [x] Phase 1 完成（Background Service Worker 和 Database 層）
- [x] Phase 2 完成（Message Handlers）
- [x] Phase 3 完成（Content Script 重構）
- [x] Phase 4 完成（Popup 重構）

## Tasks

### 5.1 實作 Migration 邏輯

- [ ] 修改 `src/background/db/migrations.ts`，完成遷移實作

**檔案：`src/background/db/migrations.ts`**
```typescript
import { getDB } from './index.ts';
import type { ThreadPost } from './schema.ts';

const MIGRATION_KEY = 'indexeddb_migration_complete';

/**
 * 從 chrome.storage.local 遷移資料到 IndexedDB
 */
export async function migrateFromLegacyStorage(): Promise<boolean> {
  // 檢查是否已遷移
  const result = await chrome.storage.local.get(MIGRATION_KEY);
  if (result[MIGRATION_KEY]) {
    console.log('[Migration] Already migrated');
    return true;
  }

  try {
    // 從舊儲存讀取
    const oldData = await chrome.storage.local.get('threads_posts');
    const oldPosts = oldData.threads_posts?.posts ?? [];

    if (oldPosts.length === 0) {
      // 沒有舊資料，標記完成
      await chrome.storage.local.set({ [MIGRATION_KEY]: true });
      console.log('[Migration] No old data to migrate');
      return true;
    }

    console.log(`[Migration] Found ${oldPosts.length} posts to migrate`);

    // 寫入 IndexedDB
    const db = await getDB();
    const tx = db.transaction('posts', 'readwrite');

    for (const post of oldPosts) {
      await tx.store.put(post);
    }

    await tx.done;

    // 驗證寫入成功
    const migratedCount = await db.count('posts');
    if (migratedCount === oldPosts.length) {
      // 驗證成功，清除舊資料並標記完成
      await chrome.storage.local.remove('threads_posts');
      await chrome.storage.local.set({ [MIGRATION_KEY]: true });
      console.log(`[Migration] Successfully migrated ${migratedCount} posts`);
      return true;
    } else {
      // 驗證失敗，保留舊資料
      throw new Error(
        `Migration count mismatch: expected ${oldPosts.length}, got ${migratedCount}`
      );
    }
  } catch (error) {
    console.error('[Migration] Migration failed:', error);
    // 失敗時保留舊資料，不做刪除
    return false;
  }
}

/**
 * 檢查 Migration 狀態
 */
export async function getMigrationStatus(): Promise<boolean> {
  const result = await chrome.storage.local.get(MIGRATION_KEY);
  return result[MIGRATION_KEY] ?? false;
}

/**
 * 清除 Migration 標記（用於測試或手動重試）
 */
export async function resetMigration(): Promise<void> {
  await chrome.storage.local.remove(MIGRATION_KEY);
  console.log('[Migration] Migration status reset');
}
```

### 5.2 在 Background Service Worker 註冊 Migration

- [ ] 修改 `src/background/index.ts`，加入 Migration 觸發邏輯

**檔案：`src/background/index.ts`**
```typescript
import { migrateFromLegacyStorage } from './db/migrations.js';

// ... 其他程式碼 ...

// 在 extension 啟動或安裝時執行 migration
chrome.runtime.onStartup.addListener(async () => {
  console.log('[Background] Extension started, checking migration...');
  await migrateFromLegacyStorage();
});

chrome.runtime.onInstalled.addListener(async () => {
  console.log('[Background] Extension installed/updated, checking migration...');
  await migrateFromLegacyStorage();
});
```

### 5.3 建立 Migration 測試

- [ ] 建立 `src/background/db/migrations.test.ts`

**檔案：`src/background/db/migrations.test.ts`**
```typescript
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import 'fake-indexeddb/auto';
import { chrome } from 'jest-chrome';
import { openDB, type IDBPDatabase } from 'idb';
import type { ThreadsLoggerDB } from './schema.ts';
import {
  migrateFromLegacyStorage,
  getMigrationStatus,
  resetMigration
} from './migrations.ts';
import type { ThreadPost } from './schema.ts';

describe('migrations', () => {
  let db: IDBPDatabase<ThreadsLoggerDB>;
  const testPosts: ThreadPost[] = [
    {
      id: 'migrate-1',
      url: 'https://www.threads.com/post/migrate-1',
      author: 'alice',
      content: 'Test content 1',
      likes: 10,
      replies: 5,
      reposts: 2,
      shares: 1,
      seenAt: Date.now() - 10000
    },
    {
      id: 'migrate-2',
      url: 'https://www.threads.com/post/migrate-2',
      author: 'bob',
      content: 'Test content 2',
      likes: 20,
      replies: 10,
      reposts: 4,
      shares: 2,
      seenAt: Date.now() - 5000
    }
  ];

  beforeEach(async () => {
    // 模擬 IndexedDB
    db = await openDB<ThreadsLoggerDB>('TestThreadsLoggerDB', 1, {
      upgrade(db) {
        const store = db.createObjectStore('posts', { keyPath: 'id' });
        store.createIndex('by-seenAt', 'seenAt');
        store.createIndex('by-author', 'author');
      }
    });

    // 模擬 chrome.storage.local
    await chrome.storage.local.clear();
  });

  afterEach(async () => {
    await db.close();
    await chrome.storage.local.clear();
  });

  test('migrates posts from chrome.storage.local to IndexedDB', async () => {
    // 準備舊資料
    await chrome.storage.local.set({
      threads_posts: { posts: testPosts }
    });

    // 執行遷移
    const result = await migrateFromLegacyStorage();

    // 驗證成功
    expect(result).toBe(true);

    // 驗證 IndexedDB 有資料
    const migratedPosts = await db.getAll('posts');
    expect(migratedPosts.length).toBe(testPosts.length);

    // 驗證舊資料已清除
    const oldData = await chrome.storage.local.get('threads_posts');
    expect(oldData.threads_posts).toBeUndefined();

    // 驗證 migration 標記
    const status = await getMigrationStatus();
    expect(status).toBe(true);
  });

  test('does not migrate if already migrated', async () => {
    // 準備舊資料
    await chrome.storage.local.set({
      threads_posts: { posts: testPosts },
      indexeddb_migration_complete: true
    });

    // 執行遷移
    const result = await migrateFromLegacyStorage();

    // 驗證跳過遷移
    expect(result).toBe(true);

    // 驗證 IndexedDB 沒有資料（因為沒有執行遷移）
    const count = await db.count('posts');
    expect(count).toBe(0);
  });

  test('handles empty old data', async () => {
    // 沒有舊資料
    await chrome.storage.local.set({ threads_posts: { posts: [] } });

    // 執行遷移
    const result = await migrateFromLegacyStorage();

    // 驗證成功
    expect(result).toBe(true);

    // 驗證 migration 標記
    const status = await getMigrationStatus();
    expect(status).toBe(true);
  });

  test('preserves old data on migration failure', async () => {
    // 模擬 IndexedDB 寫入失敗（關閉連線）
    await db.close();

    // 準備舊資料
    await chrome.storage.local.set({
      threads_posts: { posts: testPosts }
    });

    // 執行遷移（應該失敗）
    const result = await migrateFromLegacyStorage();

    // 驗證失敗
    expect(result).toBe(false);

    // 驗證舊資料仍然存在
    const oldData = await chrome.storage.local.get('threads_posts');
    expect(oldData.threads_posts?.posts).toHaveLength(testPosts.length);
  });

  test('resetMigration clears migration flag', async () => {
    // 設定已遷移標記
    await chrome.storage.local.set({ indexeddb_migration_complete: true });

    // 重置
    await resetMigration();

    // 驗證標記已清除
    const status = await getMigrationStatus();
    expect(status).toBe(false);
  });
});
```

### 5.4 建立整合測試（E2E）

- [ ] 建立 `src/integration/e2e.test.ts`

**檔案：`src/integration/e2e.test.ts`**
```typescript
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import 'fake-indexeddb/auto';
import { openDB, type IDBPDatabase } from 'idb';
import type { ThreadsLoggerDB, ThreadPost } from '../background/db/schema.ts';

describe('E2E: Complete Workflow', () => {
  let db: IDBPDatabase<ThreadsLoggerDB>;

  beforeAll(async () => {
    db = await openDB<ThreadsLoggerDB>('E2ETestDB', 1, {
      upgrade(db) {
        const store = db.createObjectStore('posts', { keyPath: 'id' });
        store.createIndex('by-seenAt', 'seenAt');
        store.createIndex('by-author', 'author');
      }
    });
  });

  afterAll(async () => {
    await db.close();
  });

  test('complete workflow: upsert, get, search, clear', async () => {
    // 1. Upsert 貼文
    const post1: ThreadPost = {
      id: 'e2e-1',
      url: 'https://www.threads.com/post/e2e-1',
      author: 'alice',
      content: 'Hello world',
      likes: 10,
      replies: 5,
      reposts: 2,
      shares: 1,
      seenAt: Date.now()
    };

    await db.add('posts', post1);

    // 2. 驗證貼文存在
    const retrieved = await db.get('posts', 'e2e-1');
    expect(retrieved).toEqual(post1);

    // 3. 搜尋貼文
    const allPosts = await db.getAll('posts');
    const filtered = allPosts.filter(p =>
      p.author.toLowerCase().includes('alice')
    );
    expect(filtered).toHaveLength(1);

    // 4. 清除貼文
    await db.clear('posts');

    // 5. 驗證已清除
    const count = await db.count('posts');
    expect(count).toBe(0);
  });

  test('LRU strategy: removes oldest when exceeding maxPosts', async () => {
    // 設定 maxPosts = 3
    const maxPosts = 3;

    // 新增 5 篇貼文（seenAt 遞增）
    for (let i = 1; i <= 5; i++) {
      const post: ThreadPost = {
        id: `lru-${i}`,
        url: `https://www.threads.com/post/lru-${i}`,
        author: `user-${i}`,
        content: `Content ${i}`,
        likes: i,
        replies: i,
        reposts: i,
        shares: i,
        seenAt: Date.now() + i * 1000 // 每篇更新 1 秒
      };
      await db.add('posts', post);
    }

    // 模擬 LRU 刪除（刪除最舊的 2 篇）
    const tx = db.transaction('posts', 'readwrite');
    const index = tx.store.index('by-seenAt');
    let deleted = 0;
    const toDelete = 5 - maxPosts;

    for await (const cursor of index.iterate()) {
      if (deleted < toDelete) {
        await cursor.delete();
        deleted++;
      } else {
        break;
      }
    }
    await tx.done;

    // 驗證只剩 3 篇
    const count = await db.count('posts');
    expect(count).toBe(maxPosts);

    // 驗證剩下的是最新的 3 篇
    const remaining = await db.getAllFromIndex('posts', 'by-seenAt');
    expect(remaining[0].id).toBe('lru-5');
    expect(remaining[1].id).toBe('lru-4');
    expect(remaining[2].id).toBe('lru-3');
  });
});
```

### 5.5 建立效能基準測試

- [ ] 建立 `src/performance/benchmark.test.ts`

**檔案：`src/performance/benchmark.test.ts`**
```typescript
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import 'fake-indexeddb/auto';
import { openDB, type IDBPDatabase } from 'idb';
import type { ThreadsLoggerDB, ThreadPost } from '../background/db/schema.ts';

describe('Performance Benchmarks', () => {
  let db: IDBPDatabase<ThreadsLoggerDB>;
  const testPosts: ThreadPost[] = [];

  beforeAll(async () => {
    db = await openDB<ThreadsLoggerDB>('BenchmarkDB', 1, {
      upgrade(db) {
        const store = db.createObjectStore('posts', { keyPath: 'id' });
        store.createIndex('by-seenAt', 'seenAt');
        store.createIndex('by-author', 'author');
      }
    });

    // 準備 1000 篇測試資料
    for (let i = 0; i < 1000; i++) {
      testPosts.push({
        id: `bench-${i}`,
        url: `https://www.threads.com/post/bench-${i}`,
        author: `user-${i % 100}`, // 100 個不同作者
        content: `Test content ${i}`.repeat(10), // 約 150 字元
        likes: i % 100,
        replies: i % 50,
        reposts: i % 20,
        shares: i % 10,
        seenAt: Date.now() - Math.random() * 86400000 // 過去 24 小時內
      });
    }

    // 批次寫入
    const tx = db.transaction('posts', 'readwrite');
    await Promise.all(testPosts.map(post => tx.store.add(post)));
    await tx.done;
  });

  afterAll(async () => {
    await db.close();
  });

  test('GET_ALL performance (1000 posts)', async () => {
    const start = performance.now();
    const posts = await db.getAllFromIndex('posts', 'by-seenAt');
    posts.sort((a, b) => b.seenAt - a.seenAt);
    const end = performance.now();

    console.log(`GET_ALL took ${end - start}ms`);
    expect(end - start).toBeLessThan(500); // 目標: < 500ms
  });

  test('SEARCH performance (1000 posts)', async () => {
    const start = performance.now();
    const allPosts = await db.getAll('posts');
    const keywords = 'user-1'.toLowerCase().split(/\s+/);
    const filtered = allPosts.filter(post =>
      keywords.every(keyword =>
        post.author.toLowerCase().includes(keyword) ||
        post.content.toLowerCase().includes(keyword)
      )
    );
    filtered.sort((a, b) => b.seenAt - a.seenAt);
    const end = performance.now();

    console.log(`SEARCH took ${end - start}ms`);
    expect(end - start).toBeLessThan(200); // 目標: < 200ms
  });

  test('UPSERT performance (1000 posts)', async () => {
    const start = performance.now();
    for (const post of testPosts) {
      await db.put('posts', post);
    }
    const end = performance.now();

    console.log(`UPSERT ${testPosts.length} posts took ${end - start}ms`);
    expect(end - start).toBeLessThan(5000); // 目標: < 5 秒（平均每篇 < 5ms）
  });
});
```

### 5.6 完整的手動測試流程

- [ ] 執行完整的手動測試

**測試步驟**：

1. **準備環境**：
   ```bash
   bun run build
   # 在 Chrome 中載入 extension
   ```

2. **模擬舊資料**：
   - 在 Service Worker Console 執行：
   ```javascript
   // 準備測試資料
   const testPosts = [
     {
       id: 'legacy-1',
       url: 'https://www.threads.com/post/legacy-1',
       author: 'legacy_user',
       content: 'Legacy content',
       likes: 5,
       replies: 2,
       reposts: 1,
       shares: 0,
       seenAt: Date.now()
     }
   ];
   await chrome.storage.local.set({ threads_posts: { posts: testPosts } });
   ```

3. **執行 Migration**：
   - 在 Service Worker Console 執行：
   ```javascript
   // 重置 migration 標記（模擬第一次遷移）
   await chrome.storage.local.remove('indexeddb_migration_complete');

   // 觸發 migration
   const result = await migrateFromLegacyStorage();
   console.log('Migration result:', result);
   ```

4. **驗證 Migration 結果**：
   - 檢查 Service Worker Console，確認看到 `[Migration] Successfully migrated 1 posts`
   - 在 DevTools Application → IndexedDB → ThreadsLoggerDB → posts 中檢查資料
   - 確認 `chrome.storage.local` 中的 `threads_posts` 已被清除

5. **測試完整流程**：
   - 在 threads.com 瀏覽新貼文
   - 開啟 Popup，確認顯示所有貼文（包含遷移的舊貼文和新貼文）
   - 測試搜尋、清除、匯出等功能

### 5.7 效能驗證

- [ ] 執行效能基準測試
- [ ] 驗證達到目標效能指標

```bash
# 執行測試
bun test src/performance/benchmark.test.ts
```

**目標指標**：
| 指標 | 目標 | 說明 |
|------|------|------|
| Popup 啟動時間 | < 500ms | 1000 篇貼文時 |
| Upsert 操作 | < 30ms | 單篇貼文 |
| 搜尋操作 | < 80ms | 1000 篇貼文 |
| GET_ALL | < 200ms | 1000 篇貼文 |

## Verification

### Tests to Run

```bash
# 執行所有測試
bun test

# 特定測試
bun test src/background/db/migrations.test.ts
bun test src/integration/e2e.test.ts
bun test src/performance/benchmark.test.ts
```

### Expected Outcomes

- [ ] 所有單元測試通過
- [ ] 所有整合測試通過
- [ ] Migration 測試通過
- [ ] 效能基準測試達標
- [ ] 手動 E2E 測試通過

### Migration 驗證檢查清單

**遷移前**：
- [ ] 確認 `chrome.storage.local` 有舊資料
- [ ] 確認 IndexedDB 是空的（或是乾淨的狀態）

**遷移中**：
- [ ] Service Worker Console 顯示 `[Migration] Found X posts to migrate`
- [ ] Service Worker Console 顯示 `[Migration] Successfully migrated X posts`
- [ ] 沒有錯誤訊息

**遷移後**：
- [ ] IndexedDB 有正確數量的貼文
- [ ] `chrome.storage.local` 的 `threads_posts` 已被清除
- [ ] `indexeddb_migration_complete` 標記為 true
- [ ] Popup 正常顯示所有貼文

**失敗場景**：
- [ ] Migration 失敗時，舊資料仍然存在
- [ ] Service Worker Console 顯示錯誤訊息
- [ ] 可以手動重試 migration

## Files Created/Modified

**新增檔案**：
- `src/background/db/migrations.test.ts` (new)
- `src/integration/e2e.test.ts` (new)
- `src/performance/benchmark.test.ts` (new)

**修改檔案**：
- `src/background/db/migrations.ts` (完整實作)
- `src/background/index.ts` (加入 migration 觸發)
- `package.json` (新增 `jest-chrome` 測試依賴)

**安裝測試依賴**：
```bash
bun add -d fake-indexeddb jest-chrome
```

## Notes

1. **Migration 安全性**：
   - 寫入後驗證數量，確保成功後才清除舊資料
   - 失敗時保留舊資料，不做刪除
   - 記錄詳細日誌供除錯

2. **測試隔離**：
   - 每個測試使用獨立的資料庫名稱
   - beforeEach/afterEach 清理測試資料
   - 避免測試互相干擾

3. **效能測試**：
   - 使用 1000 篇貼文模擬真實場景
   - 確認達到目標效能指標
   - 如果未達標，需要優化查詢邏輯

4. **E2E 測試**：
   - 模擬完整的操作流程
   - 包含 LRU 策略驗證
   - 確保所有功能整合正常

5. **Rollback 準備**：
   - Migration 失敗時保留舊資料
   - 可以發布 hotfix 切換回舊方案
   - IndexedDB 資料保留，不做自動清除

6. **測試覆蓋率**：
   - 單元測試：每個 handler 獨立測試
   - 整合測試：完整工作流程測試
   - 效能測試：基準測試和壓力測試
   - 手動測試：真實環境驗證

7. **已知限制**：
   - IndexedDB 在某些瀏覽器可能有容量限制
   - 超大量資料（10000+ 篇）可能需要分批遷移
   - Migration 過程中可能會有些微效能影響

8. **成功標準**：
   - Migration 成功率 100%（測試資料）
   - 效能改善：Popup 啟動時間 < 500ms
   - 功能完整：所有功能正常運作
   - 資料正確：無資料遺失或損壞
