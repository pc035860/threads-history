import { useState, useRef, useEffect } from "react";
import { Download } from "lucide-react";
import type { ThreadPost } from "../../storage/types.ts";

interface ExportButtonProps {
  posts: ThreadPost[];
}

function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function formatDateTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function postsToCSV(posts: ThreadPost[]): string {
  const headers = [
    "id",
    "author",
    "content",
    "url",
    "likes",
    "replies",
    "reposts",
    "seenAt",
    "seenAtFormatted",
  ];
  const escapeCSV = (value: string | number): string => {
    const str = String(value);
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows = posts.map((post) =>
    [
      post.id,
      post.author,
      post.content,
      post.url,
      post.likes,
      post.replies,
      post.reposts,
      post.seenAt,
      formatDateTime(post.seenAt),
    ]
      .map(escapeCSV)
      .join(",")
  );

  return [headers.join(","), ...rows].join("\n");
}

export function ExportButton({ posts }: ExportButtonProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Click outside to close
  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const getFilename = (ext: string) =>
    `threads-posts-${new Date().toISOString().split("T")[0]}.${ext}`;

  const exportJSON = () => {
    const postsWithFormattedTime = posts.map((post) => ({
      ...post,
      seenAtFormatted: formatDateTime(post.seenAt),
    }));
    const json = JSON.stringify(postsWithFormattedTime, null, 2);
    downloadFile(json, getFilename("json"), "application/json");
    setOpen(false);
  };

  const exportCSV = () => {
    const csv = postsToCSV(posts);
    downloadFile(csv, getFilename("csv"), "text/csv");
    setOpen(false);
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setOpen(!open)}
        disabled={posts.length === 0}
        className="flex items-center gap-1 px-3 py-1.5 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
      >
        <Download size={14} />
        <span>Export</span>
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-28 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg overflow-hidden z-20">
          <button
            onClick={exportJSON}
            className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            JSON
          </button>
          <button
            onClick={exportCSV}
            className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            CSV
          </button>
        </div>
      )}
    </div>
  );
}
