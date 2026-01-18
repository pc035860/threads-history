import { useState } from "react";
import { Settings } from "lucide-react";
import { usePostStorage } from "./hooks/usePostStorage.ts";
import { useSearch } from "./hooks/useSearch.ts";
import { useSettings } from "./hooks/useSettings.ts";
import { SearchBar } from "./components/SearchBar.tsx";
import { PostList } from "./components/PostList.tsx";
import { ExportButton } from "./components/ExportButton.tsx";
import { SettingsPanel } from "./components/SettingsPanel.tsx";

export function App() {
  const { posts, loading } = usePostStorage();
  const { query, setQuery, filtered } = useSearch(posts);
  const { settings, loading: settingsLoading, saving, updateSettings } = useSettings();
  const [showSettings, setShowSettings] = useState(false);

  if (loading || settingsLoading) {
    return (
      <div className="w-[400px] h-[500px] flex items-center justify-center bg-white dark:bg-gray-900">
        <div className="text-gray-500 dark:text-gray-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="w-[400px] h-[500px] flex flex-col bg-white dark:bg-gray-900">
      <header className="flex items-center justify-between p-3 border-b border-gray-200 dark:border-gray-700">
        <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Threads Logger</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
            aria-label="Settings"
          >
            <Settings size={18} />
          </button>
          <ExportButton posts={filtered} />
        </div>
      </header>

      {showSettings && (
        <SettingsPanel settings={settings} saving={saving} onSave={updateSettings} />
      )}

      <SearchBar query={query} onQueryChange={setQuery} resultCount={filtered.length} />

      <PostList posts={filtered} />
    </div>
  );
}
