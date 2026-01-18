import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { ThreadPost } from "../../storage/types.ts";
import { PostItem } from "./PostItem.tsx";

interface PostListProps {
  posts: ThreadPost[];
}

const ITEM_HEIGHT = 100; // 估計的項目高度

export function PostList({ posts }: PostListProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: posts.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ITEM_HEIGHT,
    overscan: 5,
  });

  if (posts.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 text-sm">
        No posts found
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
              <PostItem post={post} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
