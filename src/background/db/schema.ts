/**
 * IndexedDB Schema for Threads Logger
 * Using idb library with DBSchema interface for type safety
 */

import type { DBSchema } from "idb";
import type { ThreadPost } from "../../storage/types.ts";

/**
 * Threads Logger Database Schema
 *
 * Stores:
 * - posts: All logged threads posts with LRU tracking
 * - metadata: Database version and total count
 */
export interface ThreadsLoggerDB extends DBSchema {
  posts: {
    key: string; // post ID
    value: ThreadPost;
    indexes: {
      "by-seenAt": number; // For sorting by recently viewed
      "by-author": string; // For filtering by author (future feature)
    };
  };

  metadata: {
    key: string;
    value: {
      version: number;
      totalCount: number;
      lastMigration: number; // timestamp
    };
  };
}

/**
 * Database name and version
 */
export const DB_NAME = "ThreadsLoggerDB";
export const DB_VERSION = 1;

/**
 * Metadata store key
 */
export const METADATA_KEY = "db_metadata";

/**
 * Store names
 */
export const POSTS_STORE = "posts";
export const METADATA_STORE = "metadata";

/**
 * Index names
 */
export const SEEN_AT_INDEX = "by-seenAt";
export const AUTHOR_INDEX = "by-author";
