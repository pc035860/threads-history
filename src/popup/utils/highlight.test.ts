import { describe, expect, test } from "bun:test";
import { getSmartSnippet, splitByKeywords } from "./highlight.ts";

describe("getSmartSnippet", () => {
  test("空內容回傳空結果", () => {
    const result = getSmartSnippet("", ["test"]);
    expect(result.text).toBe("");
    expect(result.hasEllipsisBefore).toBe(false);
    expect(result.hasEllipsisAfter).toBe(false);
  });

  test("無關鍵字時回傳前段截取", () => {
    const content = "這是一段測試文字，用來測試智慧截取功能。";
    const result = getSmartSnippet(content, []);
    expect(result.text).toBe(content);
    expect(result.hasEllipsisBefore).toBe(false);
    expect(result.hasEllipsisAfter).toBe(false);
  });

  test("關鍵字在開頭時，不需要前省略號", () => {
    const content = "關鍵字在這裡，後面還有很長的一段文字可以截取測試。";
    const result = getSmartSnippet(content, ["關鍵字"], 30);
    expect(result.hasEllipsisBefore).toBe(false);
    expect(result.text).toContain("關鍵字");
  });

  test("關鍵字在中間時，前後都有省略號", () => {
    const content =
      "這是一段很長很長的前置文字，需要足夠長度才能測試截取功能，然後這裡是我們要找的關鍵字，後面也還有很長很長的一段文字需要被截取掉才對。";
    const result = getSmartSnippet(content, ["關鍵字"], 30);
    expect(result.text).toContain("關鍵字");
    expect(result.hasEllipsisBefore).toBe(true);
    expect(result.hasEllipsisAfter).toBe(true);
  });

  test("關鍵字在結尾時，不需要後省略號", () => {
    const content = "前面有很多文字，最後是關鍵字";
    const result = getSmartSnippet(content, ["關鍵字"], 50);
    expect(result.text).toContain("關鍵字");
    expect(result.hasEllipsisAfter).toBe(false);
  });

  test("多個關鍵字時，以第一個出現的為中心", () => {
    const content = "第一個詞在這裡，第二個詞在後面。";
    const result = getSmartSnippet(content, ["第二個", "第一個"], 30);
    expect(result.text).toContain("第一個");
  });

  test("關鍵字不存在時，回傳前段截取", () => {
    const content = "這段文字裡面沒有搜尋的關鍵字。";
    const result = getSmartSnippet(content, ["不存在"], 20);
    expect(result.hasEllipsisBefore).toBe(false);
  });

  test("大小寫不敏感匹配", () => {
    const content = "This is a Test string with keyword.";
    const result = getSmartSnippet(content, ["test"], 30);
    expect(result.text.toLowerCase()).toContain("test");
  });
});

describe("splitByKeywords", () => {
  test("空文字回傳空結果", () => {
    const result = splitByKeywords("", ["test"]);
    expect(result).toEqual([{ text: "", isKeyword: false }]);
  });

  test("無關鍵字時回傳整段文字", () => {
    const result = splitByKeywords("測試文字", []);
    expect(result).toEqual([{ text: "測試文字", isKeyword: false }]);
  });

  test("正確分割並標記關鍵字", () => {
    const result = splitByKeywords("這是測試文字", ["測試"]);
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ text: "這是", isKeyword: false });
    expect(result[1]).toEqual({ text: "測試", isKeyword: true });
    expect(result[2]).toEqual({ text: "文字", isKeyword: false });
  });

  test("多個關鍵字都能正確標記", () => {
    const result = splitByKeywords("紅色和藍色都是顏色", ["紅色", "藍色"]);
    const keywords = result.filter((p) => p.isKeyword);
    expect(keywords).toHaveLength(2);
    expect(keywords[0]?.text).toBe("紅色");
    expect(keywords[1]?.text).toBe("藍色");
  });

  test("大小寫不敏感匹配", () => {
    const result = splitByKeywords("Hello World", ["hello"]);
    expect(result[0]?.isKeyword).toBe(true);
    expect(result[0]?.text).toBe("Hello");
  });

  test("處理特殊正則字元", () => {
    const result = splitByKeywords("價格是 $100 元", ["$100"]);
    const keywords = result.filter((p) => p.isKeyword);
    expect(keywords).toHaveLength(1);
    expect(keywords[0]?.text).toBe("$100");
  });

  test("連續出現的關鍵字", () => {
    const result = splitByKeywords("測試測試", ["測試"]);
    const keywords = result.filter((p) => p.isKeyword);
    expect(keywords).toHaveLength(2);
  });
});
