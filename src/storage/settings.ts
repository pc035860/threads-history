import { SETTINGS_KEY, DEFAULT_MAX_POSTS } from "../shared/constants.ts";

export interface Settings {
  maxPosts: number;
}

const defaultSettings: Settings = {
  maxPosts: DEFAULT_MAX_POSTS,
};

export async function loadSettings(): Promise<Settings> {
  const result = await chrome.storage.local.get(SETTINGS_KEY);
  const data = result[SETTINGS_KEY] as Partial<Settings> | undefined;
  return { ...defaultSettings, ...data };
}

export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
}
