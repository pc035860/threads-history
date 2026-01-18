import type { ThreadPost } from "../storage/types.ts";
import { SELECTORS, POST_CONTAINER_DEPTH } from "../shared/constants.ts";

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
    const sidesWithBorder = [borderTop, borderRight, borderBottom, borderLeft].filter(w => w > 0).length;
    if (sidesWithBorder >= 3) {
      return true;
    }
    current = current.parentElement;
  }
  return false;
}

/**
 * 從 post link 元素往上爬找到貼文容器
 * 策略：找到只包含 1 個作者連結的最大容器
 */
function getPostContainer(postLink: Element): Element | null {
  let current: Element | null = postLink;
  let bestContainer: Element | null = null;

  for (let i = 0; i < POST_CONTAINER_DEPTH && current; i++) {
    current = current.parentElement;
    if (!current) break;

    // 計算這層包含多少個作者連結
    const authorCount = current.querySelectorAll(SELECTORS.authorLink).length;

    if (authorCount === 1) {
      // 只有 1 個作者，這可能是正確的貼文容器
      bestContainer = current;
    } else if (authorCount > 1) {
      // 超過 1 個作者，已經超出單篇貼文範圍，停止
      break;
    }
  }

  return bestContainer;
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

    const escapeRegExp = (input: string): string =>
      input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

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
      const unitPattern = new RegExp(
        `^[0-9][0-9.,]*${escapeRegExp(unit)}$`,
        "i"
      );
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
  // 時間連結通常很短（< 10 字元）
  if (text.length > 15) return false;
  // 時間格式
  if (/^\d+\s*[天時分秒週月年小hdwmy]/i.test(text)) return true;
  // "剛剛"、"just now" 等
  if (/^(剛剛|just now|now)$/i.test(text)) return true;
  // 日期格式
  if (/^\d+月\d+日$/.test(text)) return true;
  if (/^\d{1,2}\/\d{1,2}$/.test(text)) return true;
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
    if (/^\d+\s*(萬|千|k|m)$/i.test(text)) return; // 10萬、5k

    // 排除 UI 文字
    const uiTexts = ["熱門", "查看動態", "查看動態查看動態", "顯示更多", "回覆", "轉發", "引用", "分享"];
    if (uiTexts.includes(text)) return;

    // 排除重複內容
    if (seenTexts.has(text)) return;

    seenTexts.add(text);
    contentParts.push(text);
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
  return Array.from(document.querySelectorAll(SELECTORS.postLink));
}
