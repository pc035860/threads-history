import { useI18n } from "../hooks/useI18n.ts";

interface SearchBarProps {
  query: string;
  onQueryChange: (query: string) => void;
  resultCount: number;
}

export function SearchBar({ query, onQueryChange, resultCount }: SearchBarProps) {
  const { t } = useI18n();

  return (
    <div className="p-3 border-b-2 border-[var(--border-subtle)] bg-[var(--bg-primary)] sticky top-0 z-10">
      <input
        type="text"
        placeholder={t("searchPlaceholder")}
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        autoFocus
        className="w-full px-3 py-2 text-sm pixel-input"
      />
      <div className="mt-2 text-xs text-[var(--text-muted)]">
        {t("searchResultCount", resultCount)}
      </div>
    </div>
  );
}
