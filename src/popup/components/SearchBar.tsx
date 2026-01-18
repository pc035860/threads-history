interface SearchBarProps {
  query: string;
  onQueryChange: (query: string) => void;
  resultCount: number;
}

export function SearchBar({
  query,
  onQueryChange,
  resultCount,
}: SearchBarProps) {
  return (
    <div className="p-3 border-b border-gray-200 bg-white sticky top-0 z-10">
      <input
        type="text"
        placeholder="Search posts..."
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      />
      <div className="mt-2 text-xs text-gray-500">
        {resultCount} post{resultCount !== 1 ? "s" : ""}
      </div>
    </div>
  );
}
