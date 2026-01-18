import type { ThreadPost } from "../../storage/types.ts";

interface ExportButtonProps {
  posts: ThreadPost[];
}

export function ExportButton({ posts }: ExportButtonProps) {
  const handleExport = () => {
    const json = JSON.stringify(posts, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `threads-posts-${new Date().toISOString().split("T")[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <button
      onClick={handleExport}
      disabled={posts.length === 0}
      className="px-4 py-2 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
    >
      Export JSON
    </button>
  );
}
