# Phase 2: Message Handlers

## Goal

實作完整的 Message Handlers，處理 Content Script 和 Popup 發送的請求，包括 CRUD 操作、搜尋、Payload 驗證等。

## Prerequisites

- [x] Phase 1 完成（Background Service Worker 和 Database 層）
- [x] `idb` 已安裝
- [x] IndexedDB 正常建立

## Tasks

### 2.1 建立 Payload 驗證器

- [ ] 建立 `src/background/handlers/validator.ts`

**檔案：`src/background/handlers/validator.ts`**
```typescript
import type { ThreadPost } from '../db/schema.ts';

export function isValidPostPayload(payload: unknown): payload is ThreadPost {
  if (!payload || typeof payload !== 'object') return false;
  const post = payload as Partial<ThreadPost>;

  return (
    typeof post.id === 'string' &&
    /^[A-Za-z0-9\-_]+$/.test(post.id) &&
    post.id.length > 0 &&
    typeof post.url === 'string' &&
    post.url.startsWith('https://www.threads.com/') &&
    typeof post.content === 'string' &&
    post.content.length <= 10000 &&
    typeof post.author === 'string' &&
    post.author.length <= 100 &&
    post.author.length > 0 &&
    typeof post.likes === 'number' && post.likes >= 0 &&
    typeof post.replies === 'number' && post.replies >= 0 &&
    typeof post.reposts === 'number' && post.reposts >= 0 &&
    typeof post.shares === 'number' && post.shares >= 0 &&
    typeof post.seenAt === 'number' && post.seenAt > 0
  );
}

export function isValidRequest(request: unknown): request is { type: string } {
  if (!request || typeof request !== 'object') return false;
  const req = request as Partial<{ type: string }>;
  return (
    typeof req.type === 'string' &&
    ['POST_UPSERT', 'POST_GET_ALL', 'POST_SEARCH', 'POST_CLEAR',
     'POST_GET_COUNT', 'SETTINGS_GET', 'SETTINGS_SET'].includes(req.type)
  );
}
```

### 2.2 建立 Post Handler

- [ ] 建立 `src/background/handlers/post-handler.ts`

**檔案：`src/background/handlers/post-handler.ts`**
```typescript
import type { IDBPDatabase } from 'idb';
import type { ThreadPost, ThreadsLoggerDB } from '../db/schema.ts';
import { getSettings } from '../../storage/settings.ts';
import { DEFAULT_MAX_POSTS } from '../../shared/constants.ts';

export async function handleUpsert(
  db: IDBPDatabase<ThreadsLoggerDB>,
  post: ThreadPost
): Promise<ThreadPost> {
  const existing = await db.get('posts', post.id);

  if (existing) {
    await db.put('posts', { ...existing, seenAt: Date.now() });
  } else {
    await db.add('posts', { ...post, seenAt: Date.now() });

    const settings = await getSettings();
    const maxPosts = settings.maxPosts ?? DEFAULT_MAX_POSTS;
    const count = await db.count('posts');

    if (count > maxPosts) {
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

      await tx.done;
    }
  }

  return post;
}

export async function handleGetAll(
  db: IDBPDatabase<ThreadsLoggerDB>,
  limit?: number
): Promise<ThreadPost[]> {
  let posts = await db.getAllFromIndex('posts', 'by-seenAt');
  posts.sort((a, b) => b.seenAt - a.seenAt);

  if (limit) {
    posts = posts.slice(0, limit);
  }

  return posts;
}

export async function handleSearch(
  db: IDBPDatabase<ThreadsLoggerDB>,
  query: string,
  limit?: number
): Promise<ThreadPost[]> {
  const allPosts = await db.getAll('posts');
  const keywords = query.toLowerCase().split(/\s+/).filter(kw => kw.length > 0);

  const filtered = allPosts.filter(post =>
    keywords.every(keyword =>
      post.author.toLowerCase().includes(keyword) ||
      post.content.toLowerCase().includes(keyword)
    )
  );

  filtered.sort((a, b) => b.seenAt - a.seenAt);

  return limit ? filtered.slice(0, limit) : filtered;
}

export async function handleClear(
  db: IDBPDatabase<ThreadsLoggerDB>
): Promise<void> {
  await db.clear('posts');
}

export async function handleGetCount(
  db: IDBPDatabase<ThreadsLoggerDB>
): Promise<number> {
  return await db.count('posts');
}
```

### 2.3 更新 Background Service Worker

- [ ] 修改 `src/background/index.ts`，整合所有 handlers

**檔案：`src/background/index.ts`（完整版）**
```typescript
import { getDB } from './db/index.ts';
import type { MessageRequest, MessageResponse } from '../../shared/messages.ts';
import type { MessageSender } from '@types/chrome';
import {
  isValidPostPayload,
  isValidRequest
} from './handlers/validator.ts';
import {
  handleUpsert,
  handleGetAll,
  handleSearch,
  handleClear,
  handleGetCount
} from './handlers/post-handler.ts';

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  handleRequest(request, sender).then(sendResponse);
  return true;
});

async function handleRequest(
  request: unknown,
  sender: MessageSender
): Promise<MessageResponse> {
  // 驗證來源
  if (sender.id !== chrome.runtime.id) {
    return { success: false, error: 'Unauthorized' };
  }

  // 驗證請求格式
  if (!isValidRequest(request)) {
    return { success: false, error: 'Invalid request' };
  }

  const req = request as MessageRequest;
  const db = await getDB();

  try {
    switch (req.type) {
      case 'POST_UPSERT': {
        if (!isValidPostPayload(req.payload)) {
          return { success: false, error: 'Invalid payload' };
        }
        const post = await handleUpsert(db, req.payload);
        return { success: true, data: post };
      }

      case 'POST_GET_ALL': {
        const posts = await handleGetAll(db, req.payload?.limit);
        return { success: true, data: posts };
      }

      case 'POST_SEARCH': {
        const posts = await handleSearch(
          db,
          req.payload.query,
          req.payload.limit
        );
        return { success: true, data: posts };
      }

      case 'POST_CLEAR': {
        await handleClear(db);
        return { success: true };
      }

      case 'POST_GET_COUNT': {
        const count = await handleGetCount(db);
        return { success: true, data: count };
      }

      case 'SETTINGS_GET': {
        const result = await chrome.storage.local.get('threads_settings');
        return { success: true, data: result.threads_settings };
      }

      case 'SETTINGS_SET': {
        await chrome.storage.local.set({ threads_settings: req.payload });
        return { success: true };
      }

      default: {
        return { success: false, error: 'Unknown message type' };
      }
    }
  } catch (error) {
    console.error('[Background] Error handling request:', error);
    return { success: false, error: String(error) };
  }
}
```

### 2.4 建立單元測試

- [ ] 建立 `src/background/handlers/validator.test.ts`

**檔案：`src/background/handlers/validator.test.ts`**
```typescript
import { describe, test, expect } from 'bun:test';
import { isValidPostPayload, isValidRequest } from './validator.ts';
import type { ThreadPost } from '../db/schema.ts';

describe('validator', () => {
  describe('isValidPostPayload', () => {
    const validPost: ThreadPost = {
      id: 'post-123',
      url: 'https://www.threads.com/post/123',
      author: 'test_user',
      content: 'Test content',
      likes: 10,
      replies: 5,
      reposts: 2,
      shares: 1,
      seenAt: Date.now()
    };

    test('accepts valid post', () => {
      expect(isValidPostPayload(validPost)).toBe(true);
    });

    test('rejects null', () => {
      expect(isValidPostPayload(null)).toBe(false);
    });

    test('rejects non-object', () => {
      expect(isValidPostPayload('string')).toBe(false);
    });

    test('rejects invalid id format', () => {
      const invalid = { ...validPost, id: 'invalid id!' };
      expect(isValidPostPayload(invalid)).toBe(false);
    });

    test('rejects non-threads URL', () => {
      const invalid = { ...validPost, url: 'https://example.com/post/123' };
      expect(isValidPostPayload(invalid)).toBe(false);
    });

    test('rejects negative likes', () => {
      const invalid = { ...validPost, likes: -1 };
      expect(isValidPostPayload(invalid)).toBe(false);
    });

    test('rejects oversized content', () => {
      const invalid = { ...validPost, content: 'x'.repeat(10001) };
      expect(isValidPostPayload(invalid)).toBe(false);
    });
  });

  describe('isValidRequest', () => {
    test('accepts valid request type', () => {
      expect(isValidRequest({ type: 'POST_UPSERT' })).toBe(true);
    });

    test('rejects invalid type', () => {
      expect(isValidRequest({ type: 'INVALID' })).toBe(false);
    });

    test('rejects non-object', () => {
      expect(isValidRequest(null)).toBe(false);
    });
  });
});
```

- [ ] 建立 `src/background/handlers/post-handler.test.ts`

**檔案：`src/background/handlers/post-handler.test.ts`**
```typescript
import { describe, test, expect, beforeEach } from 'bun:test';
import 'fake-indexeddb/auto';
import { openDB, type IDBPDatabase } from 'idb';
import type { ThreadsLoggerDB, ThreadPost } from '../db/schema.ts';
import {
  handleUpsert,
  handleGetAll,
  handleSearch
} from './post-handler.ts';

describe('post-handler', () => {
  let db: IDBPDatabase<ThreadsLoggerDB>;

  beforeEach(async () => {
    db = await openDB<ThreadsLoggerDB>('TestDB', 1, {
      upgrade(db) {
        const store = db.createObjectStore('posts', { keyPath: 'id' });
        store.createIndex('by-seenAt', 'seenAt');
        store.createIndex('by-author', 'author');
      }
    });
  });

  const testPost: ThreadPost = {
    id: 'test-1',
    url: 'https://www.threads.com/post/test-1',
    author: 'alice',
    content: 'Hello world',
    likes: 10,
    replies: 5,
    reposts: 2,
    shares: 1,
    seenAt: Date.now()
  };

  test('handleUpsert adds new post', async () => {
    await handleUpsert(db, testPost);

    const retrieved = await db.get('posts', 'test-1');
    expect(retrieved).toBeDefined();
    expect(retrieved?.author).toBe('alice');
  });

  test('handleUpsert updates seenAt for existing post', async () => {
    const originalSeenAt = testPost.seenAt;
    await handleUpsert(db, testPost);

    // 模擬時間流逝
    const updatedPost = { ...testPost, seenAt: originalSeenAt + 10000 };
    await handleUpsert(db, updatedPost);

    const retrieved = await db.get('posts', 'test-1');
    expect(retrieved?.seenAt).toBeGreaterThan(originalSeenAt);
  });

  test('handleGetAll returns posts sorted by seenAt desc', async () => {
    const post2 = { ...testPost, id: 'test-2', seenAt: testPost.seenAt + 1000 };
    const post3 = { ...testPost, id: 'test-3', seenAt: testPost.seenAt + 2000 };

    await handleUpsert(db, testPost);
    await handleUpsert(db, post2);
    await handleUpsert(db, post3);

    const posts = await handleGetAll(db);
    expect(posts[0].id).toBe('test-3');
    expect(posts[1].id).toBe('test-2');
    expect(posts[2].id).toBe('test-1');
  });

  test('handleGetAll respects limit', async () => {
    const post2 = { ...testPost, id: 'test-2' };
    await handleUpsert(db, testPost);
    await handleUpsert(db, post2);

    const posts = await handleGetAll(db, 1);
    expect(posts.length).toBe(1);
  });

  test('handleSearch filters by author', async () => {
    const post2 = { ...testPost, id: 'test-2', author: 'bob' };
    await handleUpsert(db, testPost);
    await handleUpsert(db, post2);

    const results = await handleSearch(db, 'alice');
    expect(results.length).toBe(1);
    expect(results[0].author).toBe('alice');
  });

  test('handleSearch filters by content', async () => {
    const post2 = { ...testPost, id: 'test-2', content: 'Goodbye world' };
    await handleUpsert(db, testPost);
    await handleUpsert(db, post2);

    const results = await handleSearch(db, 'hello');
    expect(results.length).toBe(1);
    expect(results[0].content).toContain('Hello');
  });

  test('handleSearch supports multiple keywords (AND logic)', async () => {
    const post2 = { ...testPost, id: 'test-2', author: 'alice', content: 'Goodbye' };
    await handleUpsert(db, testPost);
    await handleUpsert(db, post2);

    const results = await handleSearch(db, 'alice hello');
    expect(results.length).toBe(1);
    expect(results[0].content).toContain('Hello');
  });
});
```

## Code Examples

### 手動測試 Message Passing

在 Service Worker Console 測試：

```typescript
// 測試 UPSERT
chrome.runtime.sendMessage({
  type: 'POST_UPSERT',
  payload: {
    id: 'manual-test-1',
    url: 'https://www.threads.com/post/manual-test-1',
    author: 'manual_test_user',
    content: 'Manual test content',
    likes: 100,
    replies: 50,
    reposts: 10,
    shares: 5,
    seenAt: Date.now()
  }
}, console.log);
// 預期輸出: { success: true, data: { ... } }

// 測試 GET_ALL
chrome.runtime.sendMessage({
  type: 'POST_GET_ALL'
}, console.log);
// 預期輸出: { success: true, data: [...] }

// 測試 SEARCH
chrome.runtime.sendMessage({
  type: 'POST_SEARCH',
  payload: { query: 'alice' }
}, console.log);
// 預期輸出: { success: true, data: [...] }

// 測試 COUNT
chrome.runtime.sendMessage({
  type: 'POST_GET_COUNT'
}, console.log);
// 預期輸出: { success: true, data: <number> }
```

## Verification

### Tests to Run

```bash
# 執行單元測試
bun test src/background/handlers/

# 建置
bun run build

# 載入到 Chrome 並手動測試
```

### Expected Outcomes

- [ ] 所有單元測試通過（`bun test`）
- [ ] `bun run build` 成功
- [ ] Service Worker 正常啟動，無錯誤
- [ ] 手動測試所有 message type 都回傳正確結果
- [ ] 驗證器正確拒絕無效 payload
- [ ] LRU 策略正確運作（超過上限時刪除最舊的）

### 手動測試檢查清單

- [ ] POST_UPSERT：新增貼文成功
- [ ] POST_UPSERT：更新現有貼文的 seenAt
- [ ] POST_GET_ALL：回傳所有貼文，按 seenAt 降序
- [ ] POST_GET_ALL：limit 參數正確限制數量
- [ ] POST_SEARCH：按作者搜尋正確
- [ ] POST_SEARCH：按內容搜尋正確
- [ ] POST_SEARCH：多關鍵字 AND 邏輯正確
- [ ] POST_CLEAR：清空所有貼文
- [ ] POST_GET_COUNT：回傳正確數量
- [ ] SETTINGS_GET/SET：正確讀寫設定

## Files Created/Modified

**新增檔案**：
- `src/background/handlers/validator.ts` (new)
- `src/background/handlers/post-handler.ts` (new)
- `src/background/handlers/validator.test.ts` (new)
- `src/background/handlers/post-handler.test.ts` (new)
- `package.json` (新增 `fake-indexeddb` dev dependency)

**修改檔案**：
- `src/background/index.ts` (整合 handlers)

## Notes

1. **型別安全**：所有 handler 函式都有完整的型別定義，確保傳入傳出的型別正確。

2. **錯誤處理**：每個 handler 都有 try-catch 包裹，確保錯誤會被正確回傳。

3. **LRU 實作**：使用 cursor 直接刪除最舊的記錄，避免全量讀取，提升效能。

4. **測試隔離**：使用 `fake-indexeddb` 模擬 IndexedDB，測試不會影響真實資料庫。

5. **次依賴**：需要安裝 `fake-indexeddb` 作為 devDependency：
   ```bash
   bun add -d fake-indexeddb
   ```
