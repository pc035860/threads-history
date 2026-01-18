import { useMemo, useState } from "react";
import type { ThreadPost } from "../../storage/types.ts";

export function useSearch(posts: ThreadPost[]) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (!query.trim()) return posts;

    const keywords = query
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);

    return posts.filter((post) => {
      const text = `${post.author} ${post.content}`.toLowerCase();
      return keywords.every((kw) => text.includes(kw));
    });
  }, [posts, query]);

  return { query, setQuery, filtered };
}
