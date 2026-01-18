import type { ThreadPost } from "../../storage/types.ts";

interface PostItemProps {
  post: ThreadPost;
}

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  return new Date(timestamp).toLocaleDateString();
}

export function PostItem({ post }: PostItemProps) {
  return (
    <a
      href={post.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block p-3 hover:bg-gray-50 border-b border-gray-100"
    >
      <div className="flex items-center justify-between mb-1">
        <span className="font-medium text-sm text-gray-900">@{post.author}</span>
        <span className="text-xs text-gray-400">
          {formatRelativeTime(post.seenAt)}
        </span>
      </div>
      <p className="text-sm text-gray-700 line-clamp-2 mb-2">{post.content}</p>
      <div className="flex gap-4 text-xs text-gray-500">
        {post.likes > 0 && <span>{post.likes} likes</span>}
        {post.replies > 0 && <span>{post.replies} replies</span>}
        {post.reposts > 0 && <span>{post.reposts} reposts</span>}
      </div>
    </a>
  );
}
