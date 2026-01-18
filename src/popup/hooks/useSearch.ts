import { useMemo, useState } from "react";
import type { ThreadPost } from "../../storage/types.ts";

export function useSearch(posts: ThreadPost[]) {
  const [query, setQuery] = useState("");

  const keywords = useMemo(() => {
    return query.trim() ? query.toLowerCase().split(/\s+/).filter(Boolean) : [];
  }, [query]);

  const filtered = useMemo(() => {
    if (keywords.length === 0) return posts;

    return posts.filter((post) => {
      const text = `${post.author} ${post.content}`.toLowerCase();
      return keywords.every((kw) => text.includes(kw));
    });
  }, [posts, keywords]);

  return { query, setQuery, filtered, keywords };
}
