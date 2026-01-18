import { useI18n } from "../hooks/useI18n.ts";

interface SearchBarProps {
  query: string;
  onQueryChange: (query: string) => void;
  resultCount: number;
}

export function SearchBar({ query, onQueryChange, resultCount }: SearchBarProps) {
  const { t } = useI18n();

  return (
    <div className="p-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 sticky top-0 z-10">
      <input
        type="text"
        placeholder={t("searchPlaceholder")}
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      />
      <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
        {t("searchResultCount", resultCount)}
      </div>
    </div>
  );
}
