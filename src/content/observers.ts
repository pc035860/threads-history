import { SELECTORS, DEFAULT_MAX_POSTS } from "../shared/constants.ts";
import { debug } from "../shared/debug.ts";
import { extractPostData } from "./post-extractor.ts";
import { savePost } from "../storage/lru-storage.ts";
import { loadSettings } from "../storage/settings.ts";

// 追蹤元素的可見狀態，用於偵測「進入視窗」的轉換
const elementVisibility = new WeakMap<Element, boolean>();

// 設定快取
let cachedMaxPosts = DEFAULT_MAX_POSTS;

/**
 * 處理進入視窗的貼文
 */
async function handleVisiblePost(postLink: Element): Promise<void> {
  const postData = extractPostData(postLink);
  if (!postData) {
    debug.log("Failed to extract post data from:", postLink);
    return;
  }

  // 每次進入視窗都更新 seenAt（LRU 策略）
  await savePost(postData, cachedMaxPosts);
  debug.log("Saved post:", postData.id, postData.author);
}

/**
 * IntersectionObserver - 持續偵測貼文進入/離開視窗
 */
const intersectionObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      const wasVisible = elementVisibility.get(entry.target) ?? false;
      const isVisible = entry.isIntersecting;

      // 只有從「不可見」變成「可見」時才觸發
      if (!wasVisible && isVisible) {
        handleVisiblePost(entry.target);
      }

      // 更新狀態
      elementVisibility.set(entry.target, isVisible);
    });
  },
  { threshold: 0.5 }
);

/**
 * 觀察單一貼文連結（持續觀察，不 unobserve）
 */
function observePostLink(postLink: Element): void {
  // 如果已經在追蹤中，跳過
  if (elementVisibility.has(postLink)) return;

  // 初始化為不可見
  elementVisibility.set(postLink, false);
  intersectionObserver.observe(postLink);
}

/**
 * 掃描並觀察所有現有的貼文連結
 */
function scanExistingPosts(): void {
  const postLinks = document.querySelectorAll(SELECTORS.postLink);
  debug.log("Found post links:", postLinks.length, "selector:", SELECTORS.postLink);
  postLinks.forEach((link) => observePostLink(link));
}

/**
 * MutationObserver - 監聽 DOM 新增節點
 */
const mutationObserver = new MutationObserver((mutations) => {
  mutations.forEach((mutation) => {
    mutation.addedNodes.forEach((node) => {
      if (node.nodeType !== Node.ELEMENT_NODE) return;

      const element = node as Element;

      // 檢查新增節點本身是否為貼文連結
      if (element.matches?.(SELECTORS.postLink)) {
        observePostLink(element);
      }

      // 檢查新增節點的子元素
      const postLinks = element.querySelectorAll?.(SELECTORS.postLink);
      postLinks?.forEach((link) => observePostLink(link));
    });
  });
});

/**
 * 啟動觀察者
 */
export async function startObserving(): Promise<void> {
  // 載入設定
  const settings = await loadSettings();
  cachedMaxPosts = settings.maxPosts;
  debug.log("Loaded settings, maxPosts:", cachedMaxPosts);

  // 先掃描現有貼文
  scanExistingPosts();

  // 開始監聽 DOM 變化
  mutationObserver.observe(document.body, {
    childList: true,
    subtree: true,
  });

  // 監聽設定變更
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.threads_settings) {
      const newSettings = changes.threads_settings.newValue as { maxPosts?: number } | undefined;
      if (newSettings?.maxPosts) {
        cachedMaxPosts = newSettings.maxPosts;
        debug.log("Settings updated, maxPosts:", cachedMaxPosts);
      }
    }
  });

  debug.log("Started observing");
}

/**
 * 停止觀察者
 */
export function stopObserving(): void {
  mutationObserver.disconnect();
  intersectionObserver.disconnect();
  debug.log("Stopped observing");
}
