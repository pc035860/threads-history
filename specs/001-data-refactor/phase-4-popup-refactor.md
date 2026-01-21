# Phase 4: Popup Refactor

## Goal

重構 Popup 的所有 Hooks，將原本直接使用 `chrome.storage.local` 的方式改為 Message Passing 與 Background Service Worker 通訊，並實作即時更新機制。

## Prerequisites

- [x] Phase 1 完成（Background Service Worker 和 Database 層）
- [x] Phase 2 完成（Message Handlers）

## Tasks

### 4.1 建立 Message Passing Helper

- [ ] 建立 `src/popup/utils/messaging.ts`

**檔案：`src/popup/utils/messaging.ts`**
```typescript
import type { MessageRequest, MessageResponse } from '../../shared/messages.ts';

export async function sendMessage<T = unknown>(
  request: MessageRequest
): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(request, (response: MessageResponse) => {
      if (response?.success) {
        resolve(response.data as T);
      } else {
        reject(new Error(response?.error ?? 'Unknown error'));
      }
    });
  });
}
```

### 4.2 重構 usePostStorage Hook

- [ ] 修改 `src/popup/hooks/usePostStorage.ts`

**檔案：`src/popup/hooks/usePostStorage.ts`**
```typescript
import { useState, useEffect } from 'react';
import type { ThreadPost } from '../../background/db/schema.ts';
import { sendMessage } from '../utils/messaging.ts';
import type { MessageRequest } from '../../shared/messages.ts';

export function usePostStorage() {
  const [posts, setPosts] = useState<ThreadPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    // 初始載入
    sendMessage<ThreadPost[]>({ type: 'POST_GET_ALL' })
      .then(data => {
        if (mounted) {
          setPosts(data);
        }
      })
      .catch(err => {
        console.error('[usePostStorage] Failed to load posts:', err);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    // 監聽 Background 更新
    const handleMessage = (message: MessageRequest) => {
      if (message.type === 'POST_UPSERT' && mounted) {
        sendMessage<ThreadPost[]>({ type: 'POST_GET_ALL' })
          .then(data => setPosts(data));
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);

    return () => {
      mounted = false;
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
  }, []);

  const clearPosts = async (): Promise<void> => {
    await sendMessage({ type: 'POST_CLEAR' });
    setPosts([]);
  };

  return { posts, loading, clearPosts };
}
```

### 4.3 重構 useSearch Hook

- [ ] 修改 `src/popup/hooks/useSearch.ts`

**檔案：`src/popup/hooks/useSearch.ts`**
```typescript
import { useState, useCallback } from 'react';
import type { ThreadPost } from '../../background/db/schema.ts';
import { sendMessage } from '../utils/messaging.ts';

export function useSearch(posts: ThreadPost[]) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ThreadPost[]>([]);
  const [searching, setSearching] = useState(false);

  const performSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      setSearchQuery('');
      return;
    }

    setSearching(true);
    setSearchQuery(query);

    try {
      const results = await sendMessage<ThreadPost[]>({
        type: 'POST_SEARCH',
        payload: { query }
      });
      setSearchResults(results);
    } catch (error) {
      console.error('[useSearch] Search failed:', error);
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  return {
    searchQuery,
    searchResults,
    searching,
    performSearch,
    setSearchQuery
  };
}
```

### 4.4 更新 PostList 組件

- [ ] 修改 `src/popup/components/PostList.tsx`

**檔案：`src/popup/components/PostList.tsx`**

更新列表顯示邏輯，確保與新的 `useSearch` 整合：

```typescript
// 主要變更：確保 searchResults 優先顯示
export function PostList() {
  const { posts, loading } = usePostStorage();
  const { searchResults, searching, performSearch } = useSearch(posts);

  const displayPosts = searchQuery ? searchResults : posts;

  return (
    <div>
      <SearchBar onSearch={performSearch} searching={searching} />

      {loading ? (
        <div>Loading...</div>
      ) : (
        <VirtualList
          data={displayPosts}
          // ... 其他 props
        />
      )}
    </div>
  );
}
```

### 4.5 更新 ExportButton

- [ ] 修改 `src/popup/components/ExportButton.tsx`

**檔案：`src/popup/components/ExportButton.tsx`**

確保匯出功能使用 `usePostStorage` 的資料（不需要修改邏輯，因為資料來源已經是從 Hook 取得）：

```typescript
// 確認使用 posts 從 usePostStorage
const { posts } = usePostStorage();

// 匯出邏輯不變，因為 posts 已經是 ThreadPost[]
const handleExportJSON = () => {
  const data = JSON.stringify(posts, null, 2);
  // ... 匯出邏輯
};
```

### 4.6 更新 SettingsPanel

- [ ] 修改 `src/popup/components/SettingsPanel.tsx`

**檔案：`src/popup/components/SettingsPanel.tsx`**

更新設定存取邏輯（或保持不變，因為 settings 仍在 chrome.storage.local）：

```typescript
// 如果設定仍在 chrome.storage.local，可以繼續使用 useSettings
// 或改用 Message Passing（建議保持簡單，直接存取）

// 選項 1：繼續使用 chrome.storage.local（推薦）
const { settings, updateSettings } = useSettings();

// 選項 2：改用 Message Passing（更一致）
import { sendMessage } from '../utils/messaging.js';

const [maxPosts, setMaxPosts] = useState(1000);

useEffect(() => {
  sendMessage<{ maxPosts: number }>({ type: 'SETTINGS_GET' })
    .then(data => setMaxPosts(data.maxPosts));
}, []);

const handleSave = async () => {
  await sendMessage({
    type: 'SETTINGS_SET',
    payload: { maxPosts }
  });
};
```

### 4.7 更新 useI18n Hook

- [ ] 檢查 `src/popup/hooks/useI18n.ts`

通常不需要修改，因為 i18n 使用 Chrome Extension API，不受影響：

```typescript
// 應該保持不變
export function useI18n() {
  // ... 使用 chrome.i18n.getMessage
}
```

### 4.8 本地測試

- [ ] 執行 `bun run build`
- [ ] 在 Chrome 中重新載入 extension
- [ ] 開啟 Popup
- [ ] 測試所有功能：
  - [ ] 貼文列表正常顯示
  - [ ] 搜尋功能正常
  - [ ] 清除功能正常
  - [ ] 匯出功能正常
  - [ ] 設定功能正常
  - [ ] 即時更新正常（Content Script 新增貼文後 Popup 自動更新）

## Code Examples

### 測試即時更新機制

**步驟 1**：開啟 Popup

**步驟 2**：在 threads.com 滾動瀏覽新貼文

**步驟 3**：檢查 Popup 是否自動更新（應該看到貼文數量增加）

**步驟 4**：在 Popup Console 測試

```javascript
// 測試 Message Passing
chrome.runtime.sendMessage({ type: 'POST_GET_COUNT' }, console.log);
chrome.runtime.sendMessage({ type: 'POST_GET_ALL' }, console.log);
```

### 完整的整合測試

```typescript
// 在 Popup 的 React DevTools 中測試
// 1. 檢查 posts 狀態
console.log(window.__REACT_DEVTOOLS_GLOBAL_HOOK__?.renderers?.get(1)?.getCurrentFiber()?.memoizedState?.posts);

// 2. 觸發搜尋
// 在搜尋框輸入關鍵字，檢查 searchResults

// 3. 觸發清除
// 點擊清除按鈕，檢查 posts 是否變成空陣列
```

## Verification

### Tests to Run

```bash
# 建置
bun run build

# 在 Chrome 中完整測試
# 1. 重新載入 extension
# 2. 開啟 Popup
# 3. 測試所有功能
# 4. 開啟 threads.com 瀏覽貼文
# 5. 回到 Popup 檢查即時更新
```

### Expected Outcomes

- [ ] `bun run build` 成功，無錯誤
- [ ] Popup 正常開啟，無錯誤
- [ ] 貼文列表正常顯示
- [ ] 搜尋功能正常（作者、內容、多關鍵字）
- [ ] 清除功能正常
- [ ] 匯出功能正常（JSON/CSV）
- [ ] 設定功能正常（儲存、讀取）
- [ ] 即時更新正常（Content Script 新增後 Popup 自動更新）

### 手動測試檢查清單

**基礎功能**：
- [ ] Popup 載入時間 < 500ms（效能改善）
- [ ] 貼文按 seenAt 降序排列
- [ ] 虛擬滾動正常（@tanstack/react-virtual）

**搜尋功能**：
- [ ] 按作者搜尋正確
- [ ] 按內容搜尋正確
- [ ] 多關鍵字 AND 邏輯正確
- [ ] 清空搜尋框後顯示所有貼文

**即時更新**：
- [ ] Content Script 新增貼文後，Popup 自動更新
- [ ] 多個 Popup 同時開啟時，全部同步更新

**匯出功能**：
- [ ] JSON 匯出正確
- [ ] CSV 匯出正確
- [ ] 匯出的資料格式正確

**設定功能**：
- [ ] maxPosts 設定正常儲存
- [ ] maxPosts 設定正常讀取
- [ ] LRU 策略正確運作

## Files Created/Modified

**新增檔案**：
- `src/popup/utils/messaging.ts` (new)

**修改檔案**：
- `src/popup/hooks/usePostStorage.ts` (改用 Message Passing)
- `src/popup/hooks/useSearch.ts` (改用 Message Passing)
- `src/popup/components/PostList.tsx` (整合新的 useSearch)
- `src/popup/components/SettingsPanel.tsx` (可能更新)

**未變更檔案**：
- `src/popup/hooks/useI18n.ts` (i18n 不受影響)
- `src/popup/components/SearchBar.tsx` (UI 不變)
- `src/popup/components/PostItem.tsx` (UI 不變)
- `src/popup/utils/highlight.ts` (搜尋高亮不變)

## Notes

1. **即時更新機制**：
   - Background Service Worker 在收到 `POST_UPSERT` 時，會發送訊息通知所有開啟的 Popup
   - Popup 監聽 `chrome.runtime.onMessage`，收到通知後重新載入資料
   - 這樣可以確保多個 Popup 同步更新

2. **效能考量**：
   - 初始載入使用 Message Passing，避免一次性載入大量資料阻塞 UI
   - 搜尋由 Background 處理，利用 IndexedDB 索引加速

3. **錯誤處理**：
   - 所有 Message Passing 呼叫都有 try-catch 包裹
   - 失敗時在 Console 顯示錯誤訊息，不影響 UI 運作

4. **向後相容**：
   - 設定功能可以繼續使用 `chrome.storage.local`
   - 不需要強迫所有功能都改用 Message Passing

5. **除錯技巧**：
   - Popup 的 Console 在 Popup 的 DevTools
   - Service Worker 的 Console 在 chrome://extensions
   - 兩者分開，需同時監控

6. **測試建議**：
   - 先測試基礎功能（顯示、搜尋、清除）
   - 再測試即時更新（需要 Content Script 配合）
   - 最後測試整合功能（匯出、設定）

7. **已知限制**：
   - 如果 Service Worker 被終止，Message Passing 會自動喚醒它
   - 這可能導致第一次請求稍微慢一點（< 100ms）
   - 但這是正常行為，不需要特殊處理
