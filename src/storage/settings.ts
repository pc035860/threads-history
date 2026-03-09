import {
  SETTINGS_KEY,
  DEFAULT_MAX_POSTS,
  MIN_MAX_POSTS,
  MAX_MAX_POSTS,
} from "../shared/constants.ts";

export interface Settings {
  maxPosts: number;
}

const defaultSettings: Settings = {
  maxPosts: DEFAULT_MAX_POSTS,
};

export function normalizeMaxPosts(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_MAX_POSTS;
  }

  return Math.min(MAX_MAX_POSTS, Math.max(MIN_MAX_POSTS, Math.round(value)));
}

export function normalizeSettings(settings?: Partial<Settings>): Settings {
  return {
    ...defaultSettings,
    maxPosts: normalizeMaxPosts(settings?.maxPosts),
  };
}

export async function loadSettings(): Promise<Settings> {
  const result = await chrome.storage.local.get(SETTINGS_KEY);
  const data = result[SETTINGS_KEY] as Partial<Settings> | undefined;
  return normalizeSettings(data);
}

export async function saveSettings(settings: Settings): Promise<Settings> {
  const normalizedSettings = normalizeSettings(settings);
  await chrome.storage.local.set({ [SETTINGS_KEY]: normalizedSettings });
  return normalizedSettings;
}
