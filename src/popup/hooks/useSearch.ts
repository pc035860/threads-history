/**
 * useSearch Hook
 * Searches posts by keywords using Background Service Worker (IndexedDB)
 */

import { useMemo, useState, useCallback } from "react";
import type { ThreadPost } from "../../storage/types.ts";
import { searchPosts as searchPostsRemote } from "../utils/messaging.ts";

export function useSearch(posts: ThreadPost[]) {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<ThreadPost[]>(posts);

  const keywords = useMemo(() => {
    return query.trim() ? query.toLowerCase().split(/\s+/).filter(Boolean) : [];
  }, [query]);

  // Perform search via Background Service Worker when keywords change
  const performSearch = useCallback(
    async (kw: string[]) => {
      if (kw.length === 0) {
        setResults(posts);
        return;
      }

      setSearching(true);
      try {
        const searchResults = await searchPostsRemote(kw);
        setResults(searchResults);
      } catch (error) {
        console.error("Failed to search posts:", error);
        setResults(posts); // Fallback to all posts
      } finally {
        setSearching(false);
      }
    },
    [posts]
  );

  // Reset results when posts change
  const resetResults = useCallback(() => {
    if (keywords.length === 0) {
      setResults(posts);
    }
  }, [keywords.length, posts]);

  // Auto-search when keywords change
  const performAutoSearch = useCallback(async () => {
    if (keywords.length === 0) {
      setResults(posts);
    } else {
      await performSearch(keywords);
    }
  }, [keywords, posts, performSearch]);

  return {
    query,
    setQuery,
    results,
    searching,
    keywords,
    performSearch,
    resetResults,
    performAutoSearch,
  };
}
