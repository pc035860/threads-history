export interface SmartSnippetResult {
  text: string;
  hasEllipsisBefore: boolean;
  hasEllipsisAfter: boolean;
}

/**
 * 智慧截取包含關鍵字的段落
 * @param content 原始內容
 * @param keywords 搜尋關鍵字陣列
 * @param maxLength 最大截取長度
 * @returns 截取結果，包含文字和省略號標記
 */
export function getSmartSnippet(
  content: string,
  keywords: string[],
  maxLength = 120
): SmartSnippetResult {
  if (!content || keywords.length === 0) {
    return {
      text: content.slice(0, maxLength),
      hasEllipsisBefore: false,
      hasEllipsisAfter: content.length > maxLength,
    };
  }

  const lowerContent = content.toLowerCase();

  // 找第一個關鍵字的位置
  let firstMatchIndex = -1;
  for (const keyword of keywords) {
    const index = lowerContent.indexOf(keyword.toLowerCase());
    if (index !== -1 && (firstMatchIndex === -1 || index < firstMatchIndex)) {
      firstMatchIndex = index;
    }
  }

  // 若無匹配，回傳原始截取
  if (firstMatchIndex === -1) {
    return {
      text: content.slice(0, maxLength),
      hasEllipsisBefore: false,
      hasEllipsisAfter: content.length > maxLength,
    };
  }

  // 以關鍵字為中心，前 30% 後 70% 截取
  const beforeLength = Math.floor(maxLength * 0.3);
  const afterLength = maxLength - beforeLength;

  let start = Math.max(0, firstMatchIndex - beforeLength);
  let end = Math.min(content.length, firstMatchIndex + afterLength);

  // 調整到單字邊界（避免截斷中文或英文單字）
  if (start > 0) {
    // 向前找空白或標點
    const spaceIndex = content.lastIndexOf(" ", start + 10);
    if (spaceIndex > start - 20 && spaceIndex < start + 20) {
      start = spaceIndex + 1;
    }
  }

  if (end < content.length) {
    // 向後找空白或標點
    const spaceIndex = content.indexOf(" ", end - 10);
    if (spaceIndex > end - 20 && spaceIndex < end + 20 && spaceIndex !== -1) {
      end = spaceIndex;
    }
  }

  return {
    text: content.slice(start, end),
    hasEllipsisBefore: start > 0,
    hasEllipsisAfter: end < content.length,
  };
}

/**
 * 將文字依關鍵字分割為片段
 * @param text 要分割的文字
 * @param keywords 關鍵字陣列
 * @returns 分割後的片段陣列，每個片段標記是否為關鍵字
 */
export interface TextPart {
  text: string;
  isKeyword: boolean;
}

export function splitByKeywords(text: string, keywords: string[]): TextPart[] {
  if (!text || keywords.length === 0) {
    return [{ text, isKeyword: false }];
  }

  // 建立正則表達式，用於分割文字（保留分隔符）
  const escapedKeywords = keywords.map((kw) => kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(`(${escapedKeywords.join("|")})`, "gi");

  const parts = text.split(pattern);

  return parts
    .filter((part) => part !== "")
    .map((part) => {
      const isKeyword = keywords.some((kw) => kw.toLowerCase() === part.toLowerCase());
      return { text: part, isKeyword };
    });
}
