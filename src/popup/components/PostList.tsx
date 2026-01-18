import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { ThreadPost } from "../../storage/types.ts";
import { PostItem } from "./PostItem.tsx";
import { useI18n } from "../hooks/useI18n.ts";

interface PostListProps {
  posts: ThreadPost[];
  keywords: string[];
}

const ITEM_HEIGHT = 100; // 估計的項目高度

export function PostList({ posts, keywords }: PostListProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const { t } = useI18n();

  const virtualizer = useVirtualizer({
    count: posts.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ITEM_HEIGHT,
    overscan: 5,
  });

  if (posts.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-[var(--text-muted)] text-sm">
        {t("postNotFound")}
      </div>
    );
  }

  return (
    <div ref={parentRef} className="flex-1 overflow-auto">
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: "100%",
          position: "relative",
        }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const post = posts[virtualItem.index];
          if (!post) return null;
          return (
            <div
              key={virtualItem.key}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtualItem.start}px)`,
              }}
              data-index={virtualItem.index}
              ref={virtualizer.measureElement}
            >
              <PostItem post={post} keywords={keywords} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
