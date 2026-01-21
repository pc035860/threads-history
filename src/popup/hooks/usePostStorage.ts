/**
 * usePostStorage Hook
 * Loads and manages posts from IndexedDB via Background Service Worker
 */

import { useState, useEffect, useCallback } from "react";
import type { ThreadPost } from "../../storage/types.ts";
import { getAllPosts, clearPosts, subscribeToPostsUpdates } from "../utils/messaging.ts";
import { measureAsync } from "../../shared/perf.ts";
import { debug } from "../../shared/debug.ts";

export function usePostStorage() {
  const [posts, setPosts] = useState<ThreadPost[]>([]);
  const [loading, setLoading] = useState(true);

  // Load posts from IndexedDB
  const loadPosts = useCallback(async () => {
    try {
      const loadedPosts = await measureAsync("usePostStorage (getAllPosts)", async () => {
        return await getAllPosts();
      });
      setPosts(loadedPosts);
      debug.log(`[Perf] usePostStorage: 讀取 ${loadedPosts.length} 篇貼文`);
    } catch (error) {
      console.error("Failed to load posts:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadPosts();
  }, [loadPosts]);

  // Subscribe to posts update notifications from Background
  useEffect(() => {
    const unsubscribe = subscribeToPostsUpdates(() => {
      debug.log("[usePostStorage] Posts updated notification received, reloading...");
      loadPosts();
    });

    return unsubscribe;
  }, [loadPosts]);

  // Clear all posts
  const clearAll = useCallback(async () => {
    try {
      await clearPosts();
      await loadPosts(); // Reload to reflect changes
    } catch (error) {
      console.error("Failed to clear posts:", error);
    }
  }, [loadPosts]);

  return { posts, loading, clearAll, reload: loadPosts };
}
