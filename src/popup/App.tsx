import { usePostStorage } from "./hooks/usePostStorage.ts";
import { useSearch } from "./hooks/useSearch.ts";
import { SearchBar } from "./components/SearchBar.tsx";
import { PostList } from "./components/PostList.tsx";
import { ExportButton } from "./components/ExportButton.tsx";

export function App() {
  const { posts, loading } = usePostStorage();
  const { query, setQuery, filtered } = useSearch(posts);

  if (loading) {
    return (
      <div className="w-[400px] h-[500px] flex items-center justify-center">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="w-[400px] h-[500px] flex flex-col bg-white">
      <header className="flex items-center justify-between p-3 border-b border-gray-200">
        <h1 className="text-lg font-semibold text-gray-900">Threads Logger</h1>
        <ExportButton posts={filtered} />
      </header>

      <SearchBar
        query={query}
        onQueryChange={setQuery}
        resultCount={filtered.length}
      />

      <PostList posts={filtered} />
    </div>
  );
}
