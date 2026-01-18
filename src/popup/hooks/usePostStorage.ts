import { useState, useEffect } from "react";
import type { ThreadPost } from "../../storage/types.ts";
import { loadPosts } from "../../storage/lru-storage.ts";

export function usePostStorage() {
  const [posts, setPosts] = useState<ThreadPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPosts()
      .then(setPosts)
      .catch((err) => console.error("Failed to load posts:", err))
      .finally(() => setLoading(false));
  }, []);

  return { posts, loading };
}
