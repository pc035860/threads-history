import type { ThreadPost } from "../storage/types.ts";
import { SELECTORS, POST_CONTAINER_DEPTH, HEADER_AUTHOR_LINK_LIMIT } from "../shared/constants.ts";

/**
 * 檢查元素是否在頁面上可見
 * 用於過濾切換頁籤後被隱藏的舊內容
 */
function isElementVisible(element: Element): boolean {
  if (!element) return false;

  // 檢查元素本身的顯示狀態
  const style = window.getComputedStyle(element);
  if (style.display === "none") return false;
  if (style.visibility === "hidden") return false;
  if (style.opacity === "0") return false;

  // 檢查是否有任何祖先被隱藏
  let parent: Element | null = element;
  while (parent && parent !== document.body) {
    const parentStyle = window.getComputedStyle(parent);
    if (parentStyle.display === "none" || parentStyle.visibility === "hidden") {
      return false;
    }
    parent = parent.parentElement;
  }

  // 檢查元素是否在視口內（或至少有實際尺寸）
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return false;

  return true;
}

/**
 * 檢查元素是否在引用區塊內（有完整四邊 border 的祖先）
 * 注意：貼文分隔線只有 border-top，不算引用區塊
 */
function isInsideQuoteBlock(element: Element, container: Element): boolean {
  let current: Element | null = element;
  while (current && current !== container) {
    const style = window.getComputedStyle(current);
    // 引用區塊有完整四邊 border（不只是 top）
    const borderTop = parseFloat(style.borderTopWidth) || 0;
    const borderRight = parseFloat(style.borderRightWidth) || 0;
    const borderBottom = parseFloat(style.borderBottomWidth) || 0;
    const borderLeft = parseFloat(style.borderLeftWidth) || 0;

    // 至少有三邊有 border 才算引用區塊
    const sidesWithBorder = [borderTop, borderRight, borderBottom, borderLeft].filter(
      (w) => w > 0
    ).length;
    if (sidesWithBorder >= 3) {
      return true;
    }
    current = current.parentElement;
  }
  return false;
}

/**
 * 檢查容器內是否有有效的貼文內容
 * 有效內容：非連結內、非時間格式、長度 > 5 的文字
 */
function hasValidContent(container: Element): boolean {
  const contentSpans = container.querySelectorAll(SELECTORS.contentSpan);
  for (const span of contentSpans) {
    const parent = span.parentElement;
    const grandparent = parent?.parentElement;
    const isInLink = parent?.tagName === "A" || grandparent?.tagName === "A";
    if (isInLink) continue;

    const text = span.textContent?.trim() || "";
    if (text.length <= 5) continue;
    // 排除時間格式
    if (/^\d+\s*[天時分秒週月年小hdwmy]/i.test(text)) continue;
    // 排除純數字
    if (/^[\d,]+$/.test(text)) continue;

    return true;
  }
  return false;
}

/**
 * 從 post link 元素往上爬找到貼文容器
 * 策略：
 * 1. 往上爬直到找到包含有效內容的容器
 * 2. 選擇 contentSpan 數量最多且不包含多個不同作者的容器
 * 3. 有些貼文的作者連結會重複出現（頭像+用戶名），所以需要檢查是否為不同作者
 */
function getPostContainer(postLink: Element): Element | null {
  let current: Element | null = postLink;
  const candidates: Array<{
    element: Element;
    authorCount: number;
    uniqueAuthors: Set<string>;
    contentSpanCount: number;
    hasValidContent: boolean;
    allUniqueAuthors: Set<string>;
  }> = [];

  for (let i = 0; i < POST_CONTAINER_DEPTH && current; i++) {
    current = current.parentElement;
    if (!current) break;

    // 計算這層包含多少個作者連結，以及有多少個不同的作者
    const authorLinks = current.querySelectorAll(SELECTORS.authorLink);

    // 計算「完整」的不同作者數量（用於判斷是否進入多貼文容器）
    const allUniqueAuthors = new Set<string>();
    authorLinks.forEach((link) => {
      const href = link.getAttribute("href");
      if (href) allUniqueAuthors.add(href);
    });

    // 計算「只看前面幾個」的不同作者數量（用於容器選擇，避免 @mentions 影響）
    // 貼文作者的連結通常在 header 區域（前面），mentions 在內容區域（後面）
    const headerUniqueAuthors = new Set<string>();
    authorLinks.forEach((link, idx) => {
      if (idx < HEADER_AUTHOR_LINK_LIMIT) {
        const href = link.getAttribute("href");
        if (href) headerUniqueAuthors.add(href);
      }
    });

    const contentSpanCount = current.querySelectorAll(SELECTORS.contentSpan).length;
    const hasValid = hasValidContent(current);

    candidates.push({
      element: current,
      authorCount: authorLinks.length,
      uniqueAuthors: headerUniqueAuthors, // 用於容器選擇
      contentSpanCount,
      hasValidContent: hasValid,
      allUniqueAuthors, // 保留完整資訊用於 break 判斷
    });

    // 使用「完整」作者數來判斷是否進入多貼文容器
    // 如果有多於 3 個不同作者，表示已進入包含多個貼文的容器
    if (allUniqueAuthors.size > 3) {
      break;
    }
  }

  // 策略：選擇 contentSpan 數量最多且最多只有 2 個不同作者的容器
  const validCandidates = candidates.filter(
    (c) => c.uniqueAuthors.size <= 2 && c.contentSpanCount >= 2
  );

  if (validCandidates.length === 0) {
    // fallback: 選擇第一個有內容的容器
    return candidates.find((c) => c.hasValidContent)?.element ?? null;
  }

  // 選擇 contentSpan 數量最多的
  validCandidates.sort((a, b) => b.contentSpanCount - a.contentSpanCount);
  return validCandidates[0]?.element ?? null;
}

/**
 * 從 URL 提取 post ID
 * 例如: /t/@user/post/ABC123 -> ABC123
 */
function extractPostId(url: string): string | null {
  const match = url.match(/\/post\/([^/?]+)/);
  return match?.[1] ?? null;
}

/**
 * 解析格式化數字（支援多語言單位、逗號、小數點等）
 */
function parseCount(value?: string): number {
  try {
    if (!value) return 0;
    let s = String(value).trim();
    if (!s) return 0;

    // 移除各種空白字元
    s = s.replace(/[\u00A0\u202F\s]+/g, "");

    const escapeRegExp = (input: string): string => input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    // 各語言的數字單位
    const units: Array<[string, number]> = [
      ["tūkst.", 1_000],
      ["хиљ.", 1_000],
      ["хил.", 1_000],
      ["тыс.", 1_000],
      ["тис.", 1_000],
      ["χιλ.", 1_000],
      ["hilj.", 1_000],
      ["tis.", 1_000],
      ["ming", 1_000],
      ["mijë", 1_000],
      ["elfu", 1_000],
      ["พัน", 1_000],
      ["ພັນ", 1_000],
      ["ពាន់", 1_000],
      ["ထောင်", 1_000],
      ["мянга", 1_000],
      ["миң", 1_000],
      ["հdelays", 1_000],
      ["ათ.", 1_000],
      ["mil", 1_000],
      ["rb", 1_000],
      ["þ.", 1_000],
      ["ሺ", 1_000],
      ["ද", 1_000],
      ["千", 1_000],
      ["천", 1_000],
      ["E", 1_000],
      ["N", 1_000],
      ["B", 1_000],
      ["k", 1_000],
      ["သောင်း", 10_000],
      ["万", 10_000],
      ["萬", 10_000],
      ["만", 10_000],
      ["億", 100_000_000],
      ["m", 1_000_000],
      ["b", 1_000_000_000],
    ];

    let multiplier = 1;

    for (const [unit, mul] of units) {
      const unitPattern = new RegExp(`^[0-9][0-9.,]*${escapeRegExp(unit)}$`, "i");
      if (unitPattern.test(s)) {
        multiplier = mul;
        s = s.substring(0, s.length - unit.length).trim();
        break;
      }
    }

    const lastDot = s.lastIndexOf(".");
    const lastComma = s.lastIndexOf(",");
    if (lastDot >= 0 && lastComma >= 0) {
      if (lastDot > lastComma) {
        s = s.replace(/,/g, "");
      } else {
        s = s.replace(/\./g, "");
        s = s.replace(",", ".");
      }
    } else if (multiplier > 1) {
      s = s.replace(/,/g, "");
    } else {
      const onlyDigits = s.replace(/[^0-9]/g, "");
      const n = Number(onlyDigits);
      return Number.isFinite(n) ? n : 0;
    }

    const n = Number.parseFloat(s) * multiplier;
    if (!Number.isFinite(n)) return 0;
    return Math.round(n);
  } catch {
    return 0;
  }
}

/**
 * 從容器中提取互動數據
 */
function extractInteractionCounts(container: Element): {
  likes: number;
  replies: number;
  reposts: number;
  shares: number;
} {
  const buttons = container.querySelectorAll(SELECTORS.interactionButton);
  const counts = { likes: 0, replies: 0, reposts: 0, shares: 0 };

  buttons.forEach((button) => {
    const text = button.textContent?.trim() || "";
    // 匹配數字（可帶逗號/小數點）+ 可選空格 + 可選單位（中英文）
    const countMatch = text.match(/\d[\d,.]*\s*[km萬万千億억천]?/i);
    const count = countMatch ? parseCount(countMatch[0]) : 0;

    // 根據按鈕文字判斷類型
    if (/^(讚|like)/i.test(text)) {
      counts.likes = count;
    } else if (/^(回覆|repl)/i.test(text)) {
      counts.replies = count;
    } else if (/^(轉發|轉貼|repost|quote)/i.test(text)) {
      counts.reposts = count;
    } else if (/^(分享|share)/i.test(text)) {
      counts.shares = count;
    }
  });

  return counts;
}

/**
 * 檢查是否為時間連結（而不是內容連結）
 * 時間連結的文字通常很短，像 "2天"、"3h"、"1週" 等
 */
function isTimeLink(postLink: Element): boolean {
  const text = postLink.textContent?.trim() || "";
  // 時間連結通常很短（< 15 字元）
  if (text.length > 15) return false;
  // 時間格式（相對時間）
  if (/^\d+\s*[天時分秒週月年小hdwmy]/i.test(text)) return true;
  // "剛剛"、"just now" 等
  if (/^(剛剛|just now|now)$/i.test(text)) return true;
  // 日期格式：中文 "1月9日"
  if (/^\d+月\d+日$/.test(text)) return true;
  // 日期格式：斜線分隔 "1/9" 或 "01/09"
  if (/^\d{1,2}\/\d{1,2}$/.test(text)) return true;
  // 日期格式：ISO-like "2026-1-9" 或 "2025-12-31"
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(text)) return true;
  return false;
}

/**
 * 從貼文連結元素提取完整貼文資料
 */
export function extractPostData(postLink: Element): ThreadPost | null {
  const href = postLink.getAttribute("href");
  if (!href) return null;

  const postId = extractPostId(href);
  if (!postId) return null;

  // 只處理時間連結，過濾掉內容連結
  if (!isTimeLink(postLink)) {
    return null;
  }

  const container = getPostContainer(postLink);
  if (!container) return null;

  // 檢查這個連結是否在引用區塊內（如果是，跳過）
  if (isInsideQuoteBlock(postLink, container)) {
    return null;
  }

  // 提取作者（排除引用區塊內的）
  const authorLinks = container.querySelectorAll(SELECTORS.authorLink);
  let author = "";
  for (const link of authorLinks) {
    if (!isInsideQuoteBlock(link, container)) {
      const authorHref = link.getAttribute("href") ?? "";
      author = authorHref.replace(/^\/@/, "").split("/")[0] ?? "";
      break;
    }
  }

  // 提取內容（收集所有不在引用區塊內的 span，合併多段文字）
  const contentSpans = container.querySelectorAll(SELECTORS.contentSpan);
  const contentParts: string[] = [];
  const seenTexts = new Set<string>();

  contentSpans.forEach((span) => {
    // 排除引用區塊內的內容
    if (isInsideQuoteBlock(span, container)) return;

    const text = span.textContent?.trim();
    if (!text) return;

    // 排除在連結內的 span（作者名、時間）
    const parent = span.parentElement;
    const grandparent = parent?.parentElement;
    const isInLink = parent?.tagName === "A" || grandparent?.tagName === "A";
    if (isInLink) return;

    // 排除純數字（互動數字，可能帶逗號）和時間格式
    if (/^[\d,]+$/.test(text)) return; // 123 或 4,159
    if (/^\d+\s*[天時分秒週月年小]/.test(text)) return; // 2天、23小時
    if (/^\d+\s*[hdwmy]/i.test(text)) return; // 2h, 3d, 1w
    if (/^[\d,.]+\s*[萬万千億kmb]$/i.test(text)) return; // 10萬、5k、5.5K、1.2M

    // 排除 UI 文字（中英文）
    const uiTexts = [
      // 中文
      "熱門",
      "查看動態",
      "查看動態查看動態",
      "顯示更多",
      "回覆",
      "轉發",
      "引用",
      "分享",
      "劇透",
      "敏感內容",
      // English
      "Trending",
      "View activity",
      "Show more",
      "Reply",
      "Repost",
      "Quote",
      "Share",
      "Spoiler",
      "Sensitive content",
      "Translate",
    ];
    if (uiTexts.includes(text)) return;

    // 排除重複內容
    if (seenTexts.has(text)) return;

    // 清理尾部的 UI 文字（Translate, 1/2 等）
    // 順序：先移除分頁標記，再移除翻譯按鈕
    const cleanedText = text
      .replace(/\s+\d+\/\d+\s*$/, "")
      .replace(/\s+(Translate|翻譯)\s*$/, "")
      .trim();

    if (!cleanedText) return;

    seenTexts.add(text);
    contentParts.push(cleanedText);
  });

  const content = contentParts.join("\n\n");

  // 如果沒有提取到內容，跳過（可能是頁面頂部的「串文」連結）
  if (!content) {
    return null;
  }

  // 提取互動數據
  const counts = extractInteractionCounts(container);

  return {
    id: postId,
    url: `https://www.threads.com${href}`,
    author,
    content,
    ...counts,
    seenAt: Date.now(),
  };
}

/**
 * 找出頁面上所有的貼文連結
 */
export function findAllPostLinks(): Element[] {
  const allLinks = Array.from(document.querySelectorAll(SELECTORS.postLink));
  // 過濾掉不可見的元素（例如切換頁籤後被隱藏的舊內容）
  return allLinks.filter((link) => isElementVisible(link));
}

// Export for testing only
export const __testing__ = {
  parseCount,
  isInsideQuoteBlock,
  getPostContainer,
  extractPostId,
  isTimeLink,
  extractInteractionCounts,
  hasValidContent,
};
