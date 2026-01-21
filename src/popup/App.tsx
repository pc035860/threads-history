import { useState, useEffect, useRef } from "react";
import { Settings } from "lucide-react";
import { usePostStorage } from "./hooks/usePostStorage.ts";
import { useSearch } from "./hooks/useSearch.ts";
import { useSettings } from "./hooks/useSettings.ts";
import { useI18n } from "./hooks/useI18n.ts";
import { SearchBar } from "./components/SearchBar.tsx";
import { PostList } from "./components/PostList.tsx";
import { ExportButton } from "./components/ExportButton.tsx";
import { SettingsPanel } from "./components/SettingsPanel.tsx";
import { endMark } from "../shared/perf.ts";
import { debug } from "../shared/debug.ts";

export function App() {
  const { posts, loading } = usePostStorage();
  const { query, setQuery, results, keywords, performAutoSearch, resetResults } = useSearch(posts);
  const { settings, loading: settingsLoading, saving, updateSettings } = useSettings();
  const { t } = useI18n();
  const [showSettings, setShowSettings] = useState(false);
  const firstRender = useRef(true);
  const [readyToRender, setReadyToRender] = useState(false);

  // Performance: 測量首次渲染完成時間
  useEffect(() => {
    if (!loading && !settingsLoading && firstRender.current) {
      firstRender.current = false;
      endMark("popup-load", `首次渲染完成，顯示 ${results.length} 篇貼文`);
      debug.log(`[Perf] App: posts: ${posts.length}`);
    }
  }, [loading, settingsLoading, results.length, posts.length]);

  // 延遲渲染：先顯示 loading，讓瀏覽器完成 paint，然後再渲染列表
  useEffect(() => {
    if (!loading && !settingsLoading && !readyToRender) {
      const timer = setTimeout(() => {
        setReadyToRender(true);
      }, 50); // 50ms 延遲，可調整
      return () => clearTimeout(timer);
    }
  }, [loading, settingsLoading, readyToRender]);

  // When posts change, reset search results
  useEffect(() => {
    if (!loading) {
      resetResults();
    }
  }, [posts, loading, resetResults]);

  // Auto-search when keywords change
  useEffect(() => {
    if (!loading) {
      performAutoSearch();
    }
  }, [query, loading, performAutoSearch]);

  if (loading || settingsLoading || !readyToRender) {
    return (
      <div className="w-[400px] h-[500px] flex items-center justify-center bg-[var(--bg-primary)]">
        <div className="text-[var(--text-muted)]">{t("appLoading")}</div>
      </div>
    );
  }

  return (
    <div className="w-[400px] h-[500px] flex flex-col bg-[var(--bg-primary)]">
      <header className="flex items-center justify-between p-3 border-b-2 border-[var(--border)]">
        <img src="/icons/icon-128.png" alt={t("appName")} className="h-8" />
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-1.5 icon-accent"
            aria-label={t("appSettings")}
          >
            <Settings size={18} />
          </button>
          <ExportButton posts={results} />
        </div>
      </header>

      {showSettings && (
        <SettingsPanel settings={settings} saving={saving} onSave={updateSettings} />
      )}

      <SearchBar query={query} onQueryChange={setQuery} resultCount={results.length} />

      <PostList posts={results} keywords={keywords} />
    </div>
  );
}
