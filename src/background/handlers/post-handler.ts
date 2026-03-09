/**
 * Post Handlers
 * Business logic for all post-related operations
 */

import type { ThreadPost } from "../../storage/types.ts";
import { DEFAULT_MAX_POSTS } from "../../shared/constants.ts";
import type { IDBPDatabase } from "idb";
import type { ThreadsLoggerDB } from "../db/schema.ts";
import { getAllPosts, upsertPost, searchPosts, clearPosts, getPostCount } from "../db/index.ts";
import { METADATA_KEY } from "../db/schema.ts";
import { validateThreadPost, validateSearchKeywords } from "./validator.ts";

/**
 * Handle POST_UPSERT message
 * Implements LRU strategy with maxPosts limit
 */
export async function handleUpsert(
  db: IDBPDatabase<ThreadsLoggerDB>,
  payload: ThreadPost,
  maxPosts: number = DEFAULT_MAX_POSTS
): Promise<void> {
  const post = validateThreadPost(payload);
  await upsertPost(db, post);
  const { deletedCount, totalCount } = await enforceMaxPosts(db, maxPosts);

  // eslint-disable-next-line no-console
  console.log(
    `[Handler] Upserted post ${post.id} (${totalCount} total, pruned ${deletedCount} overflow)`
  );
}

export function getOverflowPostIds(posts: ThreadPost[], maxPosts: number): string[] {
  if (posts.length <= maxPosts) {
    return [];
  }

  return posts.slice(maxPosts).map((post) => post.id);
}

export async function enforceMaxPosts(
  db: IDBPDatabase<ThreadsLoggerDB>,
  maxPosts: number = DEFAULT_MAX_POSTS
): Promise<{ deletedCount: number; totalCount: number }> {
  const allPosts = await getAllPosts(db);
  const overflowPostIds = getOverflowPostIds(allPosts, maxPosts);

  await Promise.all(overflowPostIds.map((postId) => db.delete("posts", postId)));

  const totalCount = allPosts.length - overflowPostIds.length;
  await db.put(
    "metadata",
    {
      version: 1,
      totalCount,
      lastMigration: Date.now(),
    },
    METADATA_KEY
  );

  return {
    deletedCount: overflowPostIds.length,
    totalCount,
  };
}

/**
 * Handle POST_GET_ALL message
 * Returns all posts sorted by seenAt (most recent first)
 */
export async function handleGetAll(db: IDBPDatabase<ThreadsLoggerDB>): Promise<ThreadPost[]> {
  const posts = await getAllPosts(db);
  // eslint-disable-next-line no-console
  console.log(`[Handler] Returned ${posts.length} posts`);
  return posts;
}

/**
 * Handle POST_SEARCH message
 * Searches posts by keywords (AND logic)
 */
export async function handleSearch(
  db: IDBPDatabase<ThreadsLoggerDB>,
  payload: { keywords: string[] }
): Promise<ThreadPost[]> {
  const keywords = validateSearchKeywords(payload.keywords);
  const posts = await searchPosts(db, keywords);
  // eslint-disable-next-line no-console
  console.log(`[Handler] Search for "${keywords.join(" ")}" returned ${posts.length} posts`);
  return posts;
}

/**
 * Handle POST_CLEAR message
 * Deletes all posts
 */
export async function handleClear(db: IDBPDatabase<ThreadsLoggerDB>): Promise<void> {
  await clearPosts(db);
  // Update metadata
  await db.put(
    "metadata",
    {
      version: 1,
      totalCount: 0,
      lastMigration: Date.now(),
    },
    METADATA_KEY
  );
  // eslint-disable-next-line no-console
  console.log("[Handler] Cleared all posts");
}

/**
 * Handle POST_GET_COUNT message
 * Returns total post count
 */
export async function handleGetCount(db: IDBPDatabase<ThreadsLoggerDB>): Promise<number> {
  const count = await getPostCount(db);
  // eslint-disable-next-line no-console
  console.log(`[Handler] Post count: ${count}`);
  return count;
}
