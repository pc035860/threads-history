/**
 * Data Migration from chrome.storage.local to IndexedDB
 * This module handles the one-time migration of existing posts
 */

import type { IDBPDatabase } from "idb";
import type { StorageData } from "../../storage/types.ts";
import { STORAGE_KEY } from "../../shared/constants.ts";
import type { ThreadsLoggerDB } from "./schema.ts";
import { METADATA_STORE, METADATA_KEY } from "./schema.ts";

/**
 * Migration status
 */
export enum MigrationStatus {
  NOT_STARTED = "NOT_STARTED",
  IN_PROGRESS = "IN_PROGRESS",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
}

/**
 * Migration result
 */
export interface MigrationResult {
  status: MigrationStatus;
  migratedCount: number;
  error?: string;
}

/**
 * Migration metadata key in chrome.storage.local
 */
export const MIGRATION_FLAG_KEY = "threads_migration_completed";

/**
 * Check if migration has already been completed
 */
export async function isMigrationCompleted(): Promise<boolean> {
  const result = await chrome.storage.local.get(MIGRATION_FLAG_KEY);
  return result[MIGRATION_FLAG_KEY] === true;
}

/**
 * Check if migration is needed
 * (i.e., chrome.storage.local has old data but migration not completed)
 */
export async function isMigrationNeeded(): Promise<boolean> {
  // If migration already completed, no need to migrate again
  if (await isMigrationCompleted()) {
    return false;
  }

  // Check if old storage has data
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const oldData = result[STORAGE_KEY] as StorageData | undefined;
  const hasOldData: boolean = !!(oldData?.posts && oldData.posts.length > 0);

  return hasOldData;
}

/**
 * Perform migration from chrome.storage.local to IndexedDB
 */
export async function migrateFromStorage(
  db: IDBPDatabase<ThreadsLoggerDB>
): Promise<MigrationResult> {
  try {
    // eslint-disable-next-line no-console
    console.log("[Migration] Starting migration...");

    // Check if already completed
    if (await isMigrationCompleted()) {
      // eslint-disable-next-line no-console
      console.log("[Migration] Already completed, skipping");
      return {
        status: MigrationStatus.COMPLETED,
        migratedCount: 0,
      };
    }

    // 1. Read from chrome.storage.local
    // eslint-disable-next-line no-console
    console.log("[Migration] Reading data from chrome.storage.local...");
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const oldData = result[STORAGE_KEY] as StorageData | undefined;

    if (!oldData?.posts || oldData.posts.length === 0) {
      // eslint-disable-next-line no-console
      console.log("[Migration] No data to migrate");
      return {
        status: MigrationStatus.COMPLETED,
        migratedCount: 0,
      };
    }

    const postsToMigrate = oldData.posts;
    // eslint-disable-next-line no-console
    console.log(`[Migration] Found ${postsToMigrate.length} posts to migrate`);

    // 2. Write to IndexedDB (in batches to avoid blocking)
    // eslint-disable-next-line no-console
    console.log("[Migration] Writing data to IndexedDB...");
    const BATCH_SIZE = 50;
    let migratedCount = 0;
    let failedCount = 0;
    const failedPostIds: string[] = [];

    for (let i = 0; i < postsToMigrate.length; i += BATCH_SIZE) {
      const batch = postsToMigrate.slice(i, i + BATCH_SIZE);

      for (const post of batch) {
        try {
          await db.put("posts", post);
          migratedCount++;
        } catch (error) {
          console.error(`[Migration] Failed to migrate post ${post.id}:`, error);
          failedCount++;
          failedPostIds.push(post.id);
        }
      }

      // eslint-disable-next-line no-console
      console.log(`[Migration] Migrated ${migratedCount}/${postsToMigrate.length} posts...`);

      // Yield to event loop to avoid blocking
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    // If any posts failed to migrate, abort to preserve old data
    if (failedCount > 0) {
      throw new Error(
        `Migration failed: ${failedCount} posts could not be migrated. ` +
          `Failed post IDs: ${failedPostIds.slice(0, 10).join(", ")}${failedPostIds.length > 10 ? "..." : ""}. ` +
          `Aborting to preserve old data.`
      );
    }

    // eslint-disable-next-line no-console
    console.log(`[Migration] Successfully migrated ${migratedCount} posts`);

    // 3. Verify success (compare counts)
    const idbCount = await db.count("posts");
    // eslint-disable-next-line no-console
    console.log(`[Migration] IndexedDB now has ${idbCount} posts`);

    if (idbCount < migratedCount) {
      throw new Error(
        `Migration verification failed: expected ${migratedCount} posts, got ${idbCount}`
      );
    }

    // 4. Update metadata using direct db.put
    await db.put(
      METADATA_STORE,
      {
        version: 1,
        totalCount: idbCount,
        lastMigration: Date.now(),
      },
      METADATA_KEY
    );

    // 5. Mark migration as completed
    await chrome.storage.local.set({ [MIGRATION_FLAG_KEY]: true });

    // 6. Clear old data from chrome.storage.local (safe now)
    // eslint-disable-next-line no-console
    console.log("[Migration] Clearing old data from chrome.storage.local...");
    await chrome.storage.local.remove(STORAGE_KEY);
    // eslint-disable-next-line no-console
    console.log("[Migration] Old data cleared");

    // eslint-disable-next-line no-console
    console.log("[Migration] Completed successfully!");
    return {
      status: MigrationStatus.COMPLETED,
      migratedCount,
    };
  } catch (error) {
    console.error("[Migration] Failed:", error);
    return {
      status: MigrationStatus.FAILED,
      migratedCount: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Rollback migration (restore from backup if needed)
 * Note: This is not implemented as we don't create backups
 * Old data is only deleted after successful verification
 */
export async function rollbackMigration(): Promise<void> {
  console.warn("[Migration] Rollback not implemented - old data is preserved on failure");
}
