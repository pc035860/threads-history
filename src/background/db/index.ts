/**
 * IndexedDB Database Operations
 * Provides a type-safe wrapper around idb for ThreadsLoggerDB
 */

import { openDB, type IDBPDatabase } from "idb";
import type { ThreadPost } from "../../storage/types.ts";
import {
  type ThreadsLoggerDB,
  DB_NAME,
  DB_VERSION,
  POSTS_STORE,
  METADATA_STORE,
  METADATA_KEY,
  SEEN_AT_INDEX,
  AUTHOR_INDEX,
} from "./schema.ts";

/**
 * Open the database (creates if not exists)
 */
export async function openDatabase(): Promise<IDBPDatabase<ThreadsLoggerDB>> {
  return openDB<ThreadsLoggerDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // Create posts store
      if (!db.objectStoreNames.contains(POSTS_STORE)) {
        const postsStore = db.createObjectStore(POSTS_STORE, {
          keyPath: "id",
        });
        // Index for sorting by seenAt (most recent first)
        postsStore.createIndex(SEEN_AT_INDEX, "seenAt", {
          unique: false,
        });
        // Index for filtering by author
        postsStore.createIndex(AUTHOR_INDEX, "author", {
          unique: false,
        });
      }

      // Create metadata store
      if (!db.objectStoreNames.contains(METADATA_STORE)) {
        db.createObjectStore(METADATA_STORE);
      }
    },
    blocked() {
      console.error("[DB] Database upgrade blocked by another connection");
    },
    blocking() {
      console.warn("[DB] Blocking other connections until upgrade completes");
    },
  });
}

/**
 * Get all posts sorted by seenAt (most recent first)
 */
export async function getAllPosts(db: IDBPDatabase<ThreadsLoggerDB>): Promise<ThreadPost[]> {
  const store = db.transaction(POSTS_STORE).objectStore(POSTS_STORE);
  const index = store.index(SEEN_AT_INDEX);

  // Get all posts and sort by seenAt descending
  const posts = await index.getAll();
  return posts.sort((a, b) => b.seenAt - a.seenAt);
}

/**
 * Get a single post by ID
 */
export async function getPost(
  db: IDBPDatabase<ThreadsLoggerDB>,
  postId: string
): Promise<ThreadPost | undefined> {
  return db.get(POSTS_STORE, postId);
}

/**
 * Upsert a post (insert or update with updated seenAt)
 * Implements LRU strategy: existing post's seenAt is updated
 */
export async function upsertPost(
  db: IDBPDatabase<ThreadsLoggerDB>,
  post: ThreadPost
): Promise<void> {
  // Update seenAt to current time (LRU strategy)
  const postWithUpdatedSeenAt: ThreadPost = {
    ...post,
    seenAt: Date.now(),
  };
  await db.put(POSTS_STORE, postWithUpdatedSeenAt);
}

/**
 * Search posts by keywords (AND logic)
 * Searches in author and content fields
 */
export async function searchPosts(
  db: IDBPDatabase<ThreadsLoggerDB>,
  keywords: string[]
): Promise<ThreadPost[]> {
  if (keywords.length === 0) {
    return getAllPosts(db);
  }

  const posts = await getAllPosts(db);
  const lowerKeywords = keywords.map((kw) => kw.toLowerCase());

  return posts.filter((post) => {
    const text = `${post.author} ${post.content}`.toLowerCase();
    return lowerKeywords.every((kw) => text.includes(kw));
  });
}

/**
 * Delete all posts
 */
export async function clearPosts(db: IDBPDatabase<ThreadsLoggerDB>): Promise<void> {
  await db.clear(POSTS_STORE);
}

/**
 * Get total post count
 */
export async function getPostCount(db: IDBPDatabase<ThreadsLoggerDB>): Promise<number> {
  return db.count(POSTS_STORE);
}

/**
 * Get or create metadata
 */
export async function getMetadata(
  db: IDBPDatabase<ThreadsLoggerDB>
): Promise<{ version: number; totalCount: number; lastMigration: number } | undefined> {
  return db.get(METADATA_STORE, METADATA_KEY);
}

/**
 * Update metadata
 */
export async function updateMetadata(
  db: IDBPDatabase<ThreadsLoggerDB>,
  metadata: { version: number; totalCount: number; lastMigration: number }
): Promise<void> {
  await db.put(METADATA_STORE, metadata, METADATA_KEY);
}

/**
 * Close database connection
 */
export async function closeDatabase(db: IDBPDatabase<ThreadsLoggerDB>): Promise<void> {
  db.close();
}
