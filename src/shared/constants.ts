export const SELECTORS = {
  postLink: 'a[role="link"][href*="/post/"]:not([href*="/media"])',
  authorLink: 'a[role="link"][href^="/@"]:not([href*="/post/"])',
  contentSpan: 'span[dir="auto"]',
  interactionButton: 'div[role="button"]',
} as const;

/**
 * 用於容器選擇時，只檢查前面 N 個作者連結來避免將內容中的 @mentions 算入。
 * 貼文作者的連結通常在 header 區域（前面），mentions 在內容區域（後面）。
 * 如果 Threads UI 改版導致 header 結構變化，可能需要調整此值。
 */
export const HEADER_AUTHOR_LINK_LIMIT = 5;

export const POST_CONTAINER_DEPTH = 11;

export const STORAGE_KEY = "threads_posts";
export const SETTINGS_KEY = "threads_settings";

export const MIN_MAX_POSTS = 100;
export const MAX_MAX_POSTS = 10000;
export const DEFAULT_MAX_POSTS = 1000;
