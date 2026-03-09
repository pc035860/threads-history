import { useEffect, useState } from "react";
import { normalizeMaxPosts, type Settings } from "../../storage/settings.ts";
import { useI18n } from "../hooks/useI18n.ts";
import { MIN_MAX_POSTS, MAX_MAX_POSTS } from "../../shared/constants.ts";

interface SettingsPanelProps {
  settings: Settings;
  saving: boolean;
  onSave: (settings: Settings) => void;
}

export function SettingsPanel({ settings, saving, onSave }: SettingsPanelProps) {
  const [maxPostsInput, setMaxPostsInput] = useState(String(settings.maxPosts));
  const { t } = useI18n();
  const parsedMaxPosts = Number(maxPostsInput);
  const isEmptyInput = maxPostsInput.trim() === "";
  const isInvalidInput = isEmptyInput || Number.isNaN(parsedMaxPosts);
  const normalizedMaxPosts = normalizeMaxPosts(parsedMaxPosts);

  useEffect(() => {
    setMaxPostsInput(String(settings.maxPosts));
  }, [settings.maxPosts]);

  const handleSave = () => {
    if (isInvalidInput) {
      return;
    }

    onSave({ ...settings, maxPosts: normalizedMaxPosts });
  };

  const handleBlur = () => {
    if (isEmptyInput) {
      setMaxPostsInput(String(settings.maxPosts));
      return;
    }

    setMaxPostsInput(String(normalizedMaxPosts));
  };

  return (
    <div className="p-3 border-b-2 border-[var(--border-subtle)] bg-[var(--bg-tertiary)]">
      <div className="flex items-center gap-3">
        <label className="text-sm text-[var(--text-secondary)]">{t("settingsMaxPosts")}</label>
        <input
          type="number"
          min={MIN_MAX_POSTS}
          max={MAX_MAX_POSTS}
          step={100}
          value={maxPostsInput}
          onChange={(e) => setMaxPostsInput(e.target.value)}
          onBlur={handleBlur}
          className="w-24 px-2 py-1 text-sm pixel-input"
        />
        <button
          onClick={handleSave}
          disabled={saving || isInvalidInput || normalizedMaxPosts === settings.maxPosts}
          className="px-3 py-1 text-sm pixel-btn"
        >
          {saving ? t("settingsSaving") : t("settingsSave")}
        </button>
      </div>
    </div>
  );
}
