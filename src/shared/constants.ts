export const SELECTORS = {
  postLink: 'a[role="link"][href*="/post/"]:not([href*="/media"])',
  authorLink: 'a[role="link"][href^="/@"]:not([href*="/post/"])',
  contentSpan: 'span[dir="auto"]',
  interactionButton: 'div[role="button"]',
} as const;

export const POST_CONTAINER_DEPTH = 11;

export const STORAGE_KEY = "threads_posts";

export const MAX_POSTS = 1000;
