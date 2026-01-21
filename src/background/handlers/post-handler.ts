/**
 * Post Handlers
 * Business logic for all post-related operations
 */

import type { ThreadPost } from "../../storage/types.ts";
import { DEFAULT_MAX_POSTS } from "../../shared/constants.ts";
import type { IDBPDatabase } from "idb";
import type { ThreadsLoggerDB } from "../db/schema.ts";
import {
  getAllPosts,
  getPost,
  upsertPost,
  searchPosts,
  clearPosts,
  getPostCount,
} from "../db/index.ts";
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
  // Validate payload
  const post = validateThreadPost(payload);

  // Check if post already exists
  const existing = await getPost(db, post.id);

  // If it's a new post and we're at capacity, remove oldest post
  if (!existing) {
    const count = await getPostCount(db);
    if (count >= maxPosts) {
      // Get all posts sorted by seenAt (oldest last)
      const allPosts = await getAllPosts(db);
      const oldestPost = allPosts[allPosts.length - 1];
      if (oldestPost) {
        // Delete the oldest post (using idb delete)
        await db.delete("posts", oldestPost.id);
        // eslint-disable-next-line no-console
        console.log(`[Handler] Removed oldest post ${oldestPost.id} to make room`);
      }
    }
  }

  // Upsert the post (updates seenAt if exists)
  await upsertPost(db, post);

  // Update metadata
  const newCount = await getPostCount(db);
  await db.put(
    "metadata",
    {
      version: 1,
      totalCount: newCount,
      lastMigration: Date.now(),
    },
    METADATA_KEY
  );

  // eslint-disable-next-line no-console
  console.log(`[Handler] Upserted post ${post.id} (${newCount} total)`);
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
