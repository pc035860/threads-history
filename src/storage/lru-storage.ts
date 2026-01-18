import type { ThreadPost, StorageData } from "./types.ts";
import { STORAGE_KEY, DEFAULT_MAX_POSTS } from "../shared/constants.ts";

/**
 * 寫入鎖：確保 savePost 操作序列化執行，避免 race condition
 */
let writeQueue: Promise<void> = Promise.resolve();

/**
 * 將新貼文插入或更新到貼文列表（LRU 策略）
 * - 如果貼文已存在，移到最前面並更新 seenAt
 * - 新貼文插入最前面
 * - 超過 maxPosts 時移除最舊的
 */
export function upsertPost(
  posts: ThreadPost[],
  newPost: ThreadPost,
  maxPosts: number = DEFAULT_MAX_POSTS
): ThreadPost[] {
  const filtered = posts.filter((p) => p.id !== newPost.id);
  filtered.unshift({ ...newPost, seenAt: Date.now() });
  return filtered.slice(0, maxPosts);
}

/**
 * 從 chrome.storage.local 讀取貼文列表
 */
export async function loadPosts(): Promise<ThreadPost[]> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const data = result[STORAGE_KEY] as StorageData | undefined;
  return data?.posts ?? [];
}

/**
 * 將貼文列表儲存到 chrome.storage.local
 */
export async function savePosts(posts: ThreadPost[]): Promise<void> {
  const data: StorageData = { posts };
  await chrome.storage.local.set({ [STORAGE_KEY]: data });
}

/**
 * 儲存單一貼文（使用寫入鎖確保序列化執行）
 */
export async function savePost(
  post: ThreadPost,
  maxPosts: number = DEFAULT_MAX_POSTS
): Promise<void> {
  // 將操作加入 queue，確保前一個操作完成後才執行
  writeQueue = writeQueue.then(async () => {
    const posts = await loadPosts();
    const updated = upsertPost(posts, post, maxPosts);
    await savePosts(updated);
  });
  await writeQueue;
}
