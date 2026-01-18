import { useState, useEffect, useCallback } from "react";
import { loadSettings, saveSettings, type Settings } from "../../storage/settings.ts";
import { DEFAULT_MAX_POSTS } from "../../shared/constants.ts";

export function useSettings() {
  const [settings, setSettings] = useState<Settings>({ maxPosts: DEFAULT_MAX_POSTS });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSettings().then((loaded) => {
      setSettings(loaded);
      setLoading(false);
    });
  }, []);

  const updateSettings = useCallback(async (newSettings: Settings) => {
    setSaving(true);
    await saveSettings(newSettings);
    setSettings(newSettings);
    setSaving(false);
  }, []);

  return { settings, loading, saving, updateSettings };
}
