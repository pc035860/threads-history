import { Heart, MessageCircle, Repeat2 } from "lucide-react";
import type { ThreadPost } from "../../storage/types.ts";
import { useI18n } from "../hooks/useI18n.ts";
import { HighlightedText } from "./HighlightedText.tsx";

interface PostItemProps {
  post: ThreadPost;
  keywords: string[];
}

function useFormatRelativeTime() {
  const { t } = useI18n();

  return (timestamp: number): string => {
    const now = Date.now();
    const diff = now - timestamp;

    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return t("timeJustNow");
    if (minutes < 60) return t("timeMinutesAgo", minutes);

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return t("timeHoursAgo", hours);

    const days = Math.floor(hours / 24);
    if (days < 7) return t("timeDaysAgo", days);

    return new Date(timestamp).toLocaleDateString();
  };
}

export function PostItem({ post, keywords }: PostItemProps) {
  const formatRelativeTime = useFormatRelativeTime();

  return (
    <a
      href={post.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block p-3 hover:bg-gray-50 dark:hover:bg-gray-800 border-b border-gray-100 dark:border-gray-800"
    >
      <div className="flex items-center justify-between mb-1">
        <span className="font-medium text-sm text-gray-900 dark:text-gray-100">@{post.author}</span>
        <span className="text-xs text-gray-400 dark:text-gray-500">
          {formatRelativeTime(post.seenAt)}
        </span>
      </div>
      <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
        {keywords.length > 0 ? (
          <HighlightedText content={post.content} keywords={keywords} />
        ) : (
          <span className="line-clamp-2">{post.content}</span>
        )}
      </p>
      <div className="flex gap-4 text-xs text-gray-500 dark:text-gray-400">
        {post.likes > 0 && (
          <span className="flex items-center gap-1">
            <Heart size={12} /> {post.likes}
          </span>
        )}
        {post.replies > 0 && (
          <span className="flex items-center gap-1">
            <MessageCircle size={12} /> {post.replies}
          </span>
        )}
        {post.reposts > 0 && (
          <span className="flex items-center gap-1">
            <Repeat2 size={12} /> {post.reposts}
          </span>
        )}
      </div>
    </a>
  );
}
