import type { ThreadPost, StorageData } from "./types.ts";
import { STORAGE_KEY, MAX_POSTS } from "../shared/constants.ts";

/**
 * 將新貼文插入或更新到貼文列表（LRU 策略）
 * - 如果貼文已存在，移到最前面並更新 seenAt
 * - 新貼文插入最前面
 * - 超過 MAX_POSTS 時移除最舊的
 */
export function upsertPost(
  posts: ThreadPost[],
  newPost: ThreadPost
): ThreadPost[] {
  const filtered = posts.filter((p) => p.id !== newPost.id);
  filtered.unshift({ ...newPost, seenAt: Date.now() });
  return filtered.slice(0, MAX_POSTS);
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
 * 儲存單一貼文（讀取 -> 更新 -> 寫入）
 */
export async function savePost(post: ThreadPost): Promise<void> {
  const posts = await loadPosts();
  const updated = upsertPost(posts, post);
  await savePosts(updated);
}
