import { SELECTORS, DEFAULT_MAX_POSTS } from "../shared/constants.ts";
import { debug } from "../shared/debug.ts";
import { extractPostData, findAllPostLinks } from "./post-extractor.ts";
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
 * 檢查元素是否在視窗內
 */
function isElementInViewport(element: Element): boolean {
  const rect = element.getBoundingClientRect();
  return rect.top < window.innerHeight && rect.bottom > 0;
}

/**
 * 漸進式處理貼文，避免同時啟動大量 storage 操作
 * @param links 要處理的貼文連結陣列
 * @param batchSize 每批處理的數量
 * @param delay 批次之間的延遲（毫秒）
 */
async function processPostsGradually(
  links: Element[],
  batchSize: number = 5,
  delay: number = 100
): Promise<void> {
  for (let i = 0; i < links.length; i += batchSize) {
    const batch = links.slice(i, i + batchSize);
    await Promise.all(batch.map((link) => handleVisiblePost(link)));
    if (i + batchSize < links.length) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

/**
 * 掃描並觀察所有現有的貼文連結
 * 對於已在視窗內的貼文，使用漸進式處理避免阻塞
 */
function scanExistingPosts(): void {
  const postLinks = findAllPostLinks();
  debug.log("Found post links:", postLinks.length);

  // 分離已在視窗內和不在視窗內的貼文
  const inViewport: Element[] = [];
  const outOfViewport: Element[] = [];

  postLinks.forEach((link) => {
    // 如果已經在追蹤中，跳過
    if (elementVisibility.has(link)) return;

    // 直接檢查元素是否已在視窗內
    const isInViewport = isElementInViewport(link);

    if (isInViewport) {
      inViewport.push(link);
      elementVisibility.set(link, true);
    } else {
      outOfViewport.push(link);
      elementVisibility.set(link, false);
    }

    // 開始觀察，以偵測未來的進入/離開視窗
    intersectionObserver.observe(link);
  });

  // 漸進式處理視窗內的貼文，避免阻塞 storage
  if (inViewport.length > 0) {
    debug.log("Processing", inViewport.length, "posts in viewport gradually");
    processPostsGradually(inViewport, 5, 50).catch((err) => {
      debug.log("Error processing posts gradually:", err);
    });
  }
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

  // 立即掃描現有貼文
  scanExistingPosts();

  // 延遲掃描以捕捉 React 渲染後的貼文
  setTimeout(() => scanExistingPosts(), 500);
  setTimeout(() => scanExistingPosts(), 1500);

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
