# Phase 3: Content Script Refactor

## Goal

重構 Content Script，將原本直接呼叫 `savePost()` 的方式改為使用 Message Passing 與 Background Service Worker 通訊。

## Prerequisites

- [x] Phase 1 完成（Background Service Worker 和 Database 層）
- [x] `src/shared/messages.ts` 已建立（Message Protocol 定義）

## Tasks

### 3.1 重構 Post Extractor

- [ ] 修改 `src/content/post-extractor.ts`，移除對 `lru-storage.ts` 的依賴

**現有程式碼**（需移除的部分）：
```typescript
// ❌ 舊方式：直接呼叫 savePost
import { savePost } from '../storage/lru-storage.js';

// 在提取到貼文後
await savePost(extractedPost);
```

**新方式**：
```typescript
// ✅ 改用 Message Passing
async function savePostToBackground(post: ThreadPost): Promise<void> {
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'POST_UPSERT',
      payload: post
    });

    if (!response?.success) {
      console.error('[Content] Failed to save post:', response?.error);
    }
  } catch (error) {
    console.error('[Content] Error sending message:', error);
  }
}
```

### 3.2 更新 Observer 邏輯

- [ ] 修改 `src/content/observers.ts`，整合新的儲存方式

**檔案：`src/content/observers.ts`**

找到目前呼叫 `savePost` 的地方，改用新的 Message Passing 方式：

```typescript
import { extractPostFromDOM } from './post-extractor.ts';
import type { ThreadPost } from '../storage/types.ts';

// ... 其他程式碼保持不變 ...

// 在處理偵測到的貼文時
async function handleDetectedPost(element: Element) {
  const post = extractPostFromDOM(element);
  if (!post) return;

  // 呼叫 Message Passing 儲存
  await savePostToBackground(post);
}

// 新增儲存函式
async function savePostToBackground(post: ThreadPost): Promise<void> {
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'POST_UPSERT',
      payload: post
    });

    if (response?.success) {
      console.log('[Content] Post saved:', post.id);
    } else {
      console.error('[Content] Failed to save post:', response?.error);
    }
  } catch (error) {
    console.error('[Content] Error saving post:', error);
  }
}
```

### 3.3 標記舊儲存層為 Deprecated（可選，建議與 Phase 5 同步）

> **注意**：此步驟也可以放在 Phase 5，與 Migration 實作同步進行。

- [ ] 修改 `src/storage/lru-storage.ts`，加入 deprecation 警告

**檔案：`src/storage/lru-storage.ts`**
```typescript
/**
 * @deprecated 此模組已被 IndexedDB 取代。
 * 請改用 chrome.runtime.sendMessage({ type: 'POST_UPSERT', payload: post })
 * 此檔案保留僅用於 Migration（Phase 5）。
 *
 * @see https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Content_scripts
 */
export async function savePost(
  post: ThreadPost,
  maxPosts: number = DEFAULT_MAX_POSTS
): Promise<void> {
  console.warn('[lru-storage] DEPRECATED: Please use Message Passing instead');
  // ... 保留原有實作，供 Migration 使用
}
```

### 3.4 更新 Shared Constants（如需要）

- [ ] 檢查 `src/shared/constants.ts`，確認無衝突

通常不需要修改，因為 Content Script 不再直接存取 storage。

### 3.5 本地測試

- [ ] 執行 `bun run build`
- [ ] 在 Chrome 中重新載入 extension
- [ ] 開啟 https://www.threads.com
- [ ] 滾動頁面瀏覽貼文
- [ ] 檢查 Service Worker 的 Console，確認：
  - [ ] 看到 `[Content] Post saved: xxx` 訊息
  - [ ] 沒有錯誤訊息

## Code Examples

### 完整的重構範例

**`src/content/observers.ts`（重構後）**：
```typescript
import { observePosts } from './observers.ts';

// 主要變更：將原本的 savePost() 呼叫改為 Message Passing
// 以下展示完整的重構流程

// === 舊方式 ===
// import { savePost } from '../storage/lru-storage.js';
// await savePost(post);

// === 新方式 ===
import type { ThreadPost } from '../storage/types.js';

async function savePostViaMessage(post: ThreadPost): Promise<boolean> {
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'POST_UPSERT',
      payload: post
    });
    return response?.success ?? false;
  } catch (error) {
    console.error('[Content] Failed to save post:', error);
    return false;
  }
}

// 在 IntersectionObserver callback 中使用
const observer = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (entry.isIntersecting) {
      const element = entry.target as Element;
      const post = extractPostFromDOM(element);

      if (post) {
        savePostViaMessage(post);
      }
    }
  }
}, observerOptions);
```

### 測試指令

**在 Content Script Console 測試**（在 threads.com 頁面）：

```javascript
// 測試 Message Passing
chrome.runtime.sendMessage({
  type: 'POST_UPSERT',
  payload: {
    id: 'content-test-1',
    url: 'https://www.threads.com/post/test-1',
    author: 'content_script_test',
    content: 'Test from content script',
    likes: 0,
    replies: 0,
    reposts: 0,
    shares: 0,
    seenAt: Date.now()
  }
}, console.log);
// 預期輸出: { success: true, data: { ... } }
```

## Verification

### Tests to Run

```bash
# 建置
bun run build

# 在 Chrome 中測試
# 1. 重新載入 extension
# 2. 開啟 threads.com
# 3. 滾動瀏覽貼文
# 4. 檢查 Service Worker Console
```

### Expected Outcomes

- [ ] `bun run build` 成功，無錯誤
- [ ] Content Script 正常載入，無錯誤
- [ ] 滾動瀏覽貼文時，Service Worker 收到 POST_UPSERT messages
- [ ] Service Worker Console 看到 `[Content] Post saved: xxx` 訊息
- [ ] IndexedDB 中的貼文數量增加（可在 DevTools 檢查）

### 手動測試步驟

1. **初始狀態檢查**：
   - 開啟 Service Worker DevTools
   - 執行：`chrome.runtime.sendMessage({ type: 'POST_GET_COUNT' }, console.log)`
   - 記錄初始貼文數量

2. **瀏覽貼文**：
   - 開啟 threads.com
   - 滾動頁面，瀏覽至少 5 篇貼文
   - 檢查 Service Worker Console，確認看到 5 次 `[Content] Post saved` 訊息

3. **驗證資料**：
   - 執行：`chrome.runtime.sendMessage({ type: 'POST_GET_COUNT' }, console.log)`
   - 確認數量增加了 5
   - 執行：`chrome.runtime.sendMessage({ type: 'POST_GET_ALL' }, console.log)`
   - 確認新貼文的資料正確

4. **重複瀏覽測試**：
   - 再次滾動到同一篇貼文
   - 確認只更新 `seenAt`，不會重複新增

## Files Modified

**修改檔案**：
- `src/content/observers.ts` (改用 Message Passing)
- `src/content/post-extractor.ts` (移除對 lru-storage 的依賴)
- `src/storage/lru-storage.ts` (加入 deprecation 警告)

**未變更檔案**：
- `src/shared/constants.ts`
- `src/shared/perf.ts`
- `src/shared/debug.ts`

## Notes

1. **非同步特性**：`chrome.runtime.sendMessage` 是非同步的，確保使用 `await`。

2. **錯誤處理**：加入 try-catch 包裹，避免 Message Passing 失敗導致 Content Script 崩潰。

3. **向後相容**：舊的 `lru-storage.ts` 保留但標記 deprecated，供 Phase 5 Migration 使用。

4. **除錯技巧**：
   - Content Script 的 Console 在 threads.com 頁面的 DevTools
   - Service Worker 的 Console 在 chrome://extensions 的 Service Worker 連結
   - 兩者分開，需同時監控

5. **效能考量**：Message Passing 的開銷很小（< 1ms），不會影響使用者體驗。

6. **測試建議**：
   - 先在 Service Worker Console 手動測試 Message Passing
   - 確認正常後再整合到 Content Script
   - 減少除錯時間
