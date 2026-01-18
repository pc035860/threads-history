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
    <div className="p-3 border-b-2 border-[var(--border-subtle)] bg-[var(--bg-tertiary)]">
      <div className="flex items-center gap-3">
        <label className="text-sm text-[var(--text-secondary)]">{t("settingsMaxPosts")}</label>
        <input
          type="number"
          min={100}
          max={10000}
          step={100}
          value={maxPosts}
          onChange={(e) => setMaxPosts(Number(e.target.value))}
          className="w-24 px-2 py-1 text-sm pixel-input"
        />
        <button
          onClick={handleSave}
          disabled={saving || maxPosts === settings.maxPosts}
          className="px-3 py-1 text-sm pixel-btn"
        >
          {saving ? t("settingsSaving") : t("settingsSave")}
        </button>
      </div>
    </div>
  );
}
