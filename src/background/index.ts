/**
 * Background Service Worker
 * Central message router for all extension components
 */

// Type declarations for Service Worker APIs - must be before imports
declare global {
  interface Window {
    skipWaiting(): void;
    clients: {
      claim(): Promise<undefined>;
    };
  }

  interface Event {
    waitUntil(promise: Promise<unknown>): void;
  }
}

import { openDatabase } from "./db/index.ts";
import type { MessageResponse } from "../shared/messages.ts";
import { isValidMessage, ErrorCode } from "../shared/messages.ts";
import {
  handleUpsert,
  handleGetAll,
  handleSearch,
  handleClear,
  handleGetCount,
} from "./handlers/post-handler.ts";
import { isMigrationNeeded, migrateFromStorage } from "./db/migrations.ts";
import { DEFAULT_MAX_POSTS, SETTINGS_KEY } from "../shared/constants.ts";
import { ValidationError } from "./handlers/validator.ts";

/**
 * Global database instance
 * Will be initialized when service worker starts
 */
let dbPromise: ReturnType<typeof openDatabase> | null = null;

/**
 * Cached maxPosts setting (loaded from chrome.storage.local)
 */
let cachedMaxPosts = DEFAULT_MAX_POSTS;

/**
 * Migration in progress flag
 */
let migrationInProgress = false;

/**
 * Get or initialize database instance
 */
async function getDatabase() {
  if (!dbPromise) {
    dbPromise = openDatabase();
  }
  return dbPromise;
}

/**
 * Load settings from chrome.storage.local
 */
async function loadSettings() {
  const result = await chrome.storage.local.get(SETTINGS_KEY);
  const settings = result[SETTINGS_KEY] as { maxPosts?: number } | undefined;
  if (settings?.maxPosts && typeof settings.maxPosts === "number" && settings.maxPosts > 0) {
    cachedMaxPosts = settings.maxPosts;
    // eslint-disable-next-line no-console
    console.log("[Background] Settings loaded, maxPosts:", cachedMaxPosts);
  }
}

/**
 * Message handler router
 * Routes incoming messages to appropriate handlers
 */
async function handleMessage(
  message: unknown,
  _sender: chrome.runtime.MessageSender
): Promise<MessageResponse> {
  // Validate message type
  if (!isValidMessage(message)) {
    console.error("[Background] Invalid message format:", message);
    return {
      success: false,
      code: ErrorCode.INVALID_MESSAGE_FORMAT,
      error: "Invalid message format",
    };
  }

  // Block messages during migration (except GET_COUNT for status checking)
  if (migrationInProgress && message.type !== "POST_GET_COUNT") {
    console.warn("[Background] Migration in progress, blocking request:", message.type);
    return {
      success: false,
      code: ErrorCode.MIGRATION_IN_PROGRESS,
      error: "Migration in progress, please try again later",
    };
  }

  const db = await getDatabase();

  try {
    switch (message.type) {
      case "POST_UPSERT": {
        await handleUpsert(db, message.payload, cachedMaxPosts);
        // Notify all popups that posts have been updated
        notifyPopups();
        return; // void response
      }

      case "POST_GET_ALL":
        return await handleGetAll(db);

      case "POST_SEARCH":
        return await handleSearch(db, message.payload);

      case "POST_CLEAR": {
        await handleClear(db);
        // Notify all popups that posts have been cleared
        notifyPopups();
        return; // void response
      }

      case "POST_GET_COUNT":
        return await handleGetCount(db);

      default: {
        // TypeScript should catch this, but just in case
        const _exhaustive: never = message as never;
        return {
          success: false,
          code: ErrorCode.UNKNOWN_ERROR,
          error: "Unknown message type",
        };
      }
    }

    // This should never be reached, but TypeScript needs it
    return {
      success: false,
      code: ErrorCode.UNKNOWN_ERROR,
      error: "Unexpected error",
    };
  } catch (error) {
    console.error("[Background] Handler error:", error);

    // Check if it's a ValidationError (non-retryable)
    if (error instanceof ValidationError) {
      return {
        success: false,
        code: ErrorCode.VALIDATION_ERROR,
        error: error.message,
      };
    }

    // Other errors are treated as unknown errors (retryable)
    return {
      success: false,
      code: ErrorCode.UNKNOWN_ERROR,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Notify all popup instances that posts have been updated
 */
function notifyPopups() {
  // Send notification to all potential popup listeners
  chrome.runtime
    .sendMessage({
      type: "POSTS_UPDATED",
    })
    .catch(() => {
      // Ignore errors (no popups open)
    });
}

/**
 * Service worker startup
 */
// eslint-disable-next-line no-console
console.log("[Background] Service worker starting...");

// Initialize: load settings on startup
loadSettings().catch((err) => {
  console.error("[Background] Failed to load initial settings:", err);
});

// Listen for settings changes
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;
  if (changes[SETTINGS_KEY]) {
    const newSettings = changes[SETTINGS_KEY].newValue as { maxPosts?: number } | undefined;
    if (
      newSettings?.maxPosts &&
      typeof newSettings.maxPosts === "number" &&
      newSettings.maxPosts > 0
    ) {
      cachedMaxPosts = newSettings.maxPosts;
      // eslint-disable-next-line no-console
      console.log("[Background] Settings updated, maxPosts:", cachedMaxPosts);
    }
  }
});

// Register message listener
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  // Handle async response
  handleMessage(message, _sender)
    .then((response) => {
      sendResponse(response);
    })
    .catch((error) => {
      console.error("[Background] Message handling failed:", error);
      sendResponse({
        success: false,
        code: ErrorCode.NETWORK_ERROR,
        error: error instanceof Error ? error.message : String(error),
      });
    });

  // Return true to indicate async response
  return true;
});

// Handle service worker install
self.addEventListener("install", (_event) => {
  // eslint-disable-next-line no-console
  console.log("[Background] Service worker installed");
  self.skipWaiting();
});

// Handle service worker activation
self.addEventListener("activate", (event) => {
  // eslint-disable-next-line no-console
  console.log("[Background] Service worker activated");

  // Claim all clients immediately
  event.waitUntil(
    (async () => {
      await self.clients.claim();

      // Check if migration is needed and run it
      const db = await getDatabase();
      if (await isMigrationNeeded()) {
        // Set migration in progress flag
        migrationInProgress = true;
        // eslint-disable-next-line no-console
        console.log("[Background] Migration needed, starting...");
        const result = await migrateFromStorage(db);
        // Clear migration in progress flag
        migrationInProgress = false;
        if (result.status === "COMPLETED") {
          // eslint-disable-next-line no-console
          console.log(`[Background] Migration completed: ${result.migratedCount} posts migrated`);
          // Notify all popups that migration is complete
          notifyPopups();
        } else {
          console.error("[Background] Migration failed:", result.error);
          // Migration failed, but clear flag so operations can continue
          migrationInProgress = false;
        }
      } else {
        // eslint-disable-next-line no-console
        console.log("[Background] No migration needed");
      }
    })()
  );
});

// Keep service worker alive (prevent premature termination)
// Note: This is a workaround for Chrome's aggressive SW termination
// In production, you should design for SW termination and restart
let keepAliveInterval: ReturnType<typeof setInterval> | null = null;
function startKeepAlive() {
  if (keepAliveInterval) return;
  keepAliveInterval = setInterval(() => {
    chrome.runtime.getPlatformInfo(() => {
      // This keeps the SW alive
    });
  }, 20000); // Every 20 seconds
}

chrome.runtime.onStartup.addListener(() => {
  startKeepAlive();
});

// Start keep-alive on initial load
startKeepAlive();

// eslint-disable-next-line no-console
console.log("[Background] Service worker ready");
