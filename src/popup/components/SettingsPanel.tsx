import { useState } from "react";
import type { Settings } from "../../storage/settings.ts";
import { useI18n } from "../hooks/useI18n.ts";

interface SettingsPanelProps {
  settings: Settings;
  saving: boolean;
  onSave: (settings: Settings) => void;
}

export function SettingsPanel({ settings, saving, onSave }: SettingsPanelProps) {
  const [maxPosts, setMaxPosts] = useState(settings.maxPosts);
  const { t } = useI18n();

  const handleSave = () => {
    onSave({ ...settings, maxPosts });
  };

  return (
    <div className="p-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
      <div className="flex items-center gap-3">
        <label className="text-sm text-gray-700 dark:text-gray-300">{t("settingsMaxPosts")}</label>
        <input
          type="number"
          min={100}
          max={10000}
          step={100}
          value={maxPosts}
          onChange={(e) => setMaxPosts(Number(e.target.value))}
          className="w-24 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
        />
        <button
          onClick={handleSave}
          disabled={saving || maxPosts === settings.maxPosts}
          className="px-3 py-1 bg-blue-500 text-white text-sm rounded hover:bg-blue-600 disabled:bg-gray-300 dark:disabled:bg-gray-600 disabled:cursor-not-allowed"
        >
          {saving ? t("settingsSaving") : t("settingsSave")}
        </button>
      </div>
    </div>
  );
}
