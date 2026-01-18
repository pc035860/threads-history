import { useState, useEffect } from "react";
import type { ThreadPost, StorageData } from "../../storage/types.ts";
import { loadPosts } from "../../storage/lru-storage.ts";
import { STORAGE_KEY } from "../../shared/constants.ts";
import { measureAsync } from "../../shared/perf.ts";
import { debug } from "../../shared/debug.ts";

export function usePostStorage() {
  const [posts, setPosts] = useState<ThreadPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Initial load
    measureAsync("usePostStorage (loadPosts)", async () => {
      const posts = await loadPosts();
      setPosts(posts);
      debug.log(`[Perf] usePostStorage: 讀取 ${posts.length} 篇貼文`);
      return posts.length;
    })
      .catch((err) => console.error("Failed to load posts:", err))
      .finally(() => setLoading(false));

    // Subscribe to storage changes for live updates
    const handleStorageChange = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string
    ) => {
      if (areaName !== "local") return;
      if (!changes[STORAGE_KEY]) return;

      const newData = changes[STORAGE_KEY].newValue as StorageData | undefined;
      if (newData?.posts) {
        setPosts(newData.posts);
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);

    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  return { posts, loading };
}
