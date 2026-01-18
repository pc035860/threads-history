import { useState, useEffect } from "react";
import type { ThreadPost, StorageData } from "../../storage/types.ts";
import { loadPosts } from "../../storage/lru-storage.ts";
import { STORAGE_KEY } from "../../shared/constants.ts";

export function usePostStorage() {
  const [posts, setPosts] = useState<ThreadPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Initial load
    loadPosts()
      .then(setPosts)
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
