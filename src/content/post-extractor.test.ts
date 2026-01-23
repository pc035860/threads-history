import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { Window } from "happy-dom";
import { __testing__, extractPostData } from "./post-extractor.ts";

const {
  parseCount,
  isInsideQuoteBlock,
  extractPostId,
  isTimeLink,
  extractInteractionCounts,
  hasValidContent,
  getPostContainer,
} = __testing__;

// Type helper for happy-dom elements (not fully compatible with DOM types)
type HappyDomElement = ReturnType<Window["document"]["getElementById"]>;
const asElement = (el: HappyDomElement): Element => el as unknown as Element;

// =============================================================================
// parseCount() Tests - 18 cases
// =============================================================================
describe("parseCount", () => {
  describe("empty/null values", () => {
    test("returns 0 for undefined", () => {
      expect(parseCount(undefined)).toBe(0);
    });

    test("returns 0 for empty string", () => {
      expect(parseCount("")).toBe(0);
    });

    test("returns 0 for whitespace only", () => {
      expect(parseCount("   ")).toBe(0);
    });
  });

  describe("pure numbers", () => {
    test("parses simple integer", () => {
      expect(parseCount("123")).toBe(123);
    });

    test("parses number with commas", () => {
      expect(parseCount("1,234")).toBe(1234);
    });

    test("parses number with dots as thousand separator", () => {
      expect(parseCount("1.234")).toBe(1234);
    });
  });

  describe("English units (k/m/b)", () => {
    test("parses 5k as 5000", () => {
      expect(parseCount("5k")).toBe(5000);
    });

    test("parses 2.5k as 2500", () => {
      expect(parseCount("2.5k")).toBe(2500);
    });

    test("parses 1m as 1000000", () => {
      expect(parseCount("1m")).toBe(1_000_000);
    });

    test("parses 1.5m as 1500000", () => {
      expect(parseCount("1.5m")).toBe(1_500_000);
    });

    test("parses 1B as 1000 (some languages use B for thousand)", () => {
      // Note: "B" is mapped to 1000 for some languages (appears before "b" in units)
      // The regex is case-insensitive, so both "b" and "B" match "B" first
      expect(parseCount("1B")).toBe(1_000);
    });
  });

  describe("Chinese units", () => {
    test("parses 10萬 as 100000", () => {
      expect(parseCount("10萬")).toBe(100_000);
    });

    test("parses 5千 as 5000", () => {
      expect(parseCount("5千")).toBe(5000);
    });

    test("parses 2億 as 200000000", () => {
      expect(parseCount("2億")).toBe(200_000_000);
    });
  });

  describe("Other languages", () => {
    test("parses Thai 3พัน as 3000", () => {
      expect(parseCount("3พัน")).toBe(3000);
    });

    test("parses Korean 4천 as 4000", () => {
      expect(parseCount("4천")).toBe(4000);
    });

    test("parses Korean 2만 as 20000", () => {
      expect(parseCount("2만")).toBe(20000);
    });
  });

  describe("numbers with spaces before units", () => {
    test("parses 1.6 萬 (with space) as 16000", () => {
      expect(parseCount("1.6 萬")).toBe(16000);
    });

    test("parses 2.5 千 (with space) as 2500", () => {
      expect(parseCount("2.5 千")).toBe(2500);
    });

    test("parses 1.2 k (with space) as 1200", () => {
      expect(parseCount("1.2 k")).toBe(1200);
    });
  });

  describe("edge cases", () => {
    test("returns 0 for non-numeric string", () => {
      expect(parseCount("abc")).toBe(0);
    });

    test("returns 0 for NaN string", () => {
      expect(parseCount("NaN")).toBe(0);
    });

    test("handles multiple spaces", () => {
      expect(parseCount("1.5   萬")).toBe(15000);
    });

    test("handles non-breaking space", () => {
      expect(parseCount("1.5\u00A0萬")).toBe(15000);
    });
  });
});

// =============================================================================
// isInsideQuoteBlock() Tests - 6 cases
// =============================================================================
describe("isInsideQuoteBlock", () => {
  let window: Window;
  let document: Window["document"];

  beforeEach(() => {
    window = new Window();
    document = window.document;
    // @ts-expect-error - happy-dom mock
    globalThis.window = window;
  });

  afterEach(() => {
    window.close();
    // @ts-expect-error - happy-dom cleanup
    globalThis.window = undefined;
  });

  test("returns false when element has no border", () => {
    document.body.innerHTML = `
      <div id="container">
        <div id="target">content</div>
      </div>
    `;
    const container = asElement(document.getElementById("container"));
    const target = asElement(document.getElementById("target"));
    expect(isInsideQuoteBlock(target, container)).toBe(false);
  });

  test("returns false when parent has only border-top", () => {
    document.body.innerHTML = `
      <div id="container">
        <div id="parent" style="border-top: 1px solid black;">
          <div id="target">content</div>
        </div>
      </div>
    `;
    const container = asElement(document.getElementById("container"));
    const target = asElement(document.getElementById("target"));
    expect(isInsideQuoteBlock(target, container)).toBe(false);
  });

  test("returns false when parent has only 2 borders", () => {
    document.body.innerHTML = `
      <div id="container">
        <div id="parent" style="border-top: 1px solid black; border-bottom: 1px solid black;">
          <div id="target">content</div>
        </div>
      </div>
    `;
    const container = asElement(document.getElementById("container"));
    const target = asElement(document.getElementById("target"));
    expect(isInsideQuoteBlock(target, container)).toBe(false);
  });

  test("returns true when parent has 3 borders", () => {
    document.body.innerHTML = `
      <div id="container">
        <div id="parent" style="border-top: 1px solid black; border-right: 1px solid black; border-bottom: 1px solid black;">
          <div id="target">content</div>
        </div>
      </div>
    `;
    const container = asElement(document.getElementById("container"));
    const target = asElement(document.getElementById("target"));
    expect(isInsideQuoteBlock(target, container)).toBe(true);
  });

  test("returns true when parent has all 4 borders", () => {
    document.body.innerHTML = `
      <div id="container">
        <div id="parent" style="border: 1px solid black;">
          <div id="target">content</div>
        </div>
      </div>
    `;
    const container = asElement(document.getElementById("container"));
    const target = asElement(document.getElementById("target"));
    expect(isInsideQuoteBlock(target, container)).toBe(true);
  });

  test("returns true when grandparent has quote block border", () => {
    document.body.innerHTML = `
      <div id="container">
        <div id="grandparent" style="border: 1px solid black;">
          <div id="parent">
            <div id="target">content</div>
          </div>
        </div>
      </div>
    `;
    const container = asElement(document.getElementById("container"));
    const target = asElement(document.getElementById("target"));
    expect(isInsideQuoteBlock(target, container)).toBe(true);
  });
});

// =============================================================================
// extractPostId() Tests - 4 cases
// =============================================================================
describe("extractPostId", () => {
  test("extracts ID from standard post URL", () => {
    expect(extractPostId("/t/@user/post/ABC123")).toBe("ABC123");
  });

  test("extracts ID from URL with query params", () => {
    expect(extractPostId("/t/@user/post/ABC123?ref=home")).toBe("ABC123");
  });

  test("returns null for non-post URL", () => {
    expect(extractPostId("/t/@user")).toBeNull();
  });

  test("returns null for URL without post ID", () => {
    expect(extractPostId("/t/@user/post/")).toBeNull();
  });
});

// =============================================================================
// isTimeLink() Tests - 8 cases
// =============================================================================
describe("isTimeLink", () => {
  let window: Window;
  let document: Window["document"];

  beforeEach(() => {
    window = new Window();
    document = window.document;
  });

  afterEach(() => {
    window.close();
  });

  function createLink(text: string): Element {
    const link = document.createElement("a");
    link.textContent = text;
    return asElement(link);
  }

  test("returns true for Chinese time format (2天)", () => {
    expect(isTimeLink(createLink("2天"))).toBe(true);
  });

  test("returns true for Chinese time format (23小時)", () => {
    expect(isTimeLink(createLink("23小時"))).toBe(true);
  });

  test("returns true for English time format (2h)", () => {
    expect(isTimeLink(createLink("2h"))).toBe(true);
  });

  test("returns true for English time format (3d)", () => {
    expect(isTimeLink(createLink("3d"))).toBe(true);
  });

  test('returns true for "剛剛"', () => {
    expect(isTimeLink(createLink("剛剛"))).toBe(true);
  });

  test('returns true for "just now"', () => {
    expect(isTimeLink(createLink("just now"))).toBe(true);
  });

  test("returns true for date format (1月15日)", () => {
    expect(isTimeLink(createLink("1月15日"))).toBe(true);
  });

  test("returns false for long content text", () => {
    expect(isTimeLink(createLink("這是一段很長的貼文內容"))).toBe(false);
  });

  test("returns true for minutes format (32分鐘)", () => {
    expect(isTimeLink(createLink("32分鐘"))).toBe(true);
  });

  test("returns true for weeks format (1週)", () => {
    expect(isTimeLink(createLink("1週"))).toBe(true);
  });
});

// =============================================================================
// hasValidContent() Tests - 6 cases
// =============================================================================
describe("hasValidContent", () => {
  let window: Window;
  let document: Window["document"];

  beforeEach(() => {
    window = new Window();
    document = window.document;
    // @ts-expect-error - happy-dom mock
    globalThis.window = window;
  });

  afterEach(() => {
    window.close();
    // @ts-expect-error - happy-dom cleanup
    globalThis.window = undefined;
  });

  test("returns true when container has valid content span", () => {
    document.body.innerHTML = `
      <div id="container">
        <span dir="auto">This is valid content text</span>
      </div>
    `;
    const container = asElement(document.getElementById("container"));
    expect(hasValidContent(container)).toBe(true);
  });

  test("returns false when content span is inside a link", () => {
    document.body.innerHTML = `
      <div id="container">
        <a href="/user"><span dir="auto">Link text content</span></a>
      </div>
    `;
    const container = asElement(document.getElementById("container"));
    expect(hasValidContent(container)).toBe(false);
  });

  test("returns false when content is too short (<=5 chars)", () => {
    document.body.innerHTML = `
      <div id="container">
        <span dir="auto">短</span>
      </div>
    `;
    const container = asElement(document.getElementById("container"));
    expect(hasValidContent(container)).toBe(false);
  });

  test("returns false when content is time format", () => {
    document.body.innerHTML = `
      <div id="container">
        <span dir="auto">23小時</span>
      </div>
    `;
    const container = asElement(document.getElementById("container"));
    expect(hasValidContent(container)).toBe(false);
  });

  test("returns false when content is pure numbers", () => {
    document.body.innerHTML = `
      <div id="container">
        <span dir="auto">1,234,567</span>
      </div>
    `;
    const container = asElement(document.getElementById("container"));
    expect(hasValidContent(container)).toBe(false);
  });

  test("returns false when container is empty", () => {
    document.body.innerHTML = `<div id="container"></div>`;
    const container = asElement(document.getElementById("container"));
    expect(hasValidContent(container)).toBe(false);
  });
});

// =============================================================================
// getPostContainer() Tests - 5 cases
// =============================================================================
describe("getPostContainer", () => {
  let window: Window;
  let document: Window["document"];

  beforeEach(() => {
    window = new Window();
    document = window.document;
    // @ts-expect-error - happy-dom mock
    globalThis.window = window;
  });

  afterEach(() => {
    window.close();
    // @ts-expect-error - happy-dom cleanup
    globalThis.window = undefined;
  });

  test("returns container with single author", () => {
    document.body.innerHTML = `
      <div id="outer">
        <div id="container">
          <a role="link" href="/@user1">user1</a>
          <span dir="auto">Valid content here</span>
          <a id="post-link" role="link" href="/post/123">2天</a>
        </div>
      </div>
    `;
    const postLink = asElement(document.getElementById("post-link"));
    const result = getPostContainer(postLink);
    expect(result).not.toBeNull();
    // Verify container has exactly one author link
    const authorLinks = result!.querySelectorAll('a[role="link"][href^="/@"]');
    expect(authorLinks.length).toBe(1);
  });

  test("returns null when no container found", () => {
    document.body.innerHTML = `
      <a id="post-link" role="link" href="/post/123">2天</a>
    `;
    const postLink = asElement(document.getElementById("post-link"));
    expect(getPostContainer(postLink)).toBeNull();
  });

  test("uses multi-author container when single-author container has no content", () => {
    // This simulates the single post page structure where:
    // - The time link is in a header area with only 1 author (no content)
    // - The actual content is in a larger container with multiple authors
    document.body.innerHTML = `
      <div id="multi-author-container">
        <a role="link" href="/@user1">user1</a>
        <a role="link" href="/@user2">user2</a>
        <span dir="auto">This is the actual post content</span>
        <div id="header-area">
          <a role="link" href="/@user1">user1</a>
          <a id="post-link" role="link" href="/post/123">2天</a>
        </div>
      </div>
    `;
    const postLink = asElement(document.getElementById("post-link"));
    const result = getPostContainer(postLink);
    expect(result).not.toBeNull();
    // Multi-author container should have 2+ author links and valid content
    const authorLinks = result!.querySelectorAll('a[role="link"][href^="/@"]');
    expect(authorLinks.length).toBeGreaterThanOrEqual(2);
    expect(hasValidContent(result!)).toBe(true);
  });

  test("prefers single-author container when it has valid content", () => {
    document.body.innerHTML = `
      <div id="multi-author-container">
        <a role="link" href="/@user1">user1</a>
        <a role="link" href="/@user2">user2</a>
        <div id="single-author-container">
          <a role="link" href="/@user1">user1</a>
          <span dir="auto">Content in single author container</span>
          <a id="post-link" role="link" href="/post/123">2天</a>
        </div>
      </div>
    `;
    const postLink = asElement(document.getElementById("post-link"));
    const result = getPostContainer(postLink);
    expect(result).not.toBeNull();
    // Should return single-author container (1 author link)
    const authorLinks = result!.querySelectorAll('a[role="link"][href^="/@"]');
    expect(authorLinks.length).toBe(1);
    expect(hasValidContent(result!)).toBe(true);
  });

  test("avoids multi-post container in thread page", () => {
    // 模擬串文頁面結構：
    // - 大容器包含主貼文 + 多個回覆
    // - 每個回覆都有自己的時間連結
    document.body.innerHTML = `
      <div id="thread-container">
        <a role="link" href="/@author1">author1</a>
        <span dir="auto">Main post content line 1</span>
        <span dir="auto">Main post content line 2</span>
        <a role="link" href="/post/POST1">1天</a>

        <div id="reply1-container">
          <a role="link" href="/@author2">author2</a>
          <span dir="auto">Reply 1 content line 1</span>
          <span dir="auto">Reply 1 content line 2</span>
          <a id="reply1-link" role="link" href="/post/POST2">1天</a>
        </div>

        <div id="reply2-container">
          <a role="link" href="/@author2">author2</a>
          <span dir="auto">Reply 2 content line 1</span>
          <span dir="auto">Reply 2 content line 2</span>
          <a id="reply2-link" role="link" href="/post/POST3">1天</a>
        </div>
      </div>
    `;

    const reply1Link = asElement(document.getElementById("reply1-link"));
    const reply2Link = asElement(document.getElementById("reply2-link"));

    const result1 = getPostContainer(reply1Link);
    const result2 = getPostContainer(reply2Link);

    // 應該選擇各自的小容器，而非共同的大容器
    expect(result1).not.toBeNull();
    expect(result2).not.toBeNull();

    // result1 應該只包含 POST2，不包含 POST1 和 POST3
    const links1 = result1!.querySelectorAll('a[href*="/post/"]');
    const post1Ids = Array.from(links1).map(
      (link) => link.getAttribute("href")?.match(/\/post\/([^/?]+)/)?.[1]
    );
    expect(post1Ids).toContain("POST2");
    expect(post1Ids).not.toContain("POST1");
    expect(post1Ids).not.toContain("POST3");

    // result2 應該只包含 POST3
    const links2 = result2!.querySelectorAll('a[href*="/post/"]');
    const post2Ids = Array.from(links2).map(
      (link) => link.getAttribute("href")?.match(/\/post\/([^/?]+)/)?.[1]
    );
    expect(post2Ids).toContain("POST3");
    expect(post2Ids).not.toContain("POST1");
    expect(post2Ids).not.toContain("POST2");
  });

  test("prefers smaller container over larger multi-post container", () => {
    // 模擬：小容器（3 spans）vs 大容器（47 spans，包含多個貼文）
    const manySpans = Array(44).fill('<span dir="auto">More content</span>').join("");

    document.body.innerHTML = `
      <div id="large-container">
        <a role="link" href="/@author1">author1</a>
        <a role="link" href="/@author2">author2</a>
        <span dir="auto">Content 1</span>
        <span dir="auto">Content 2</span>
        ${manySpans}
        <a role="link" href="/post/POST1">1天</a>
        <a role="link" href="/post/POST2">1天</a>

        <div id="small-container">
          <a role="link" href="/@author2">author2</a>
          <span dir="auto">Reply content line 1</span>
          <span dir="auto">Reply content line 2</span>
          <span dir="auto">Reply content line 3</span>
          <a id="reply-link" role="link" href="/post/POST2">1天</a>
        </div>
      </div>
    `;

    const replyLink = asElement(document.getElementById("reply-link"));
    const result = getPostContainer(replyLink);

    expect(result).not.toBeNull();
    expect(result!.id).toBe("small-container");

    // 驗證選擇的容器只包含 POST2
    const links = result!.querySelectorAll('a[href*="/post/"]');
    const postIds = Array.from(links).map(
      (link) => link.getAttribute("href")?.match(/\/post\/([^/?]+)/)?.[1]
    );
    expect(postIds).toEqual(["POST2"]);
  });

  test("requires at least 1 author - skips containers with 0 authors", () => {
    // 模擬 Custom Feed 頁面捲動後載入的文章
    // 問題：Level 1-2 沒有作者，只有 Level 3+ 才有作者
    document.body.innerHTML = `
      <div id="level6-container">
        <a role="link" href="/@author1">author1</a>
        <span dir="auto">Real content line 1</span>
        <span dir="auto">Real content line 2</span>
        <span dir="auto">Real content line 3</span>
        <span dir="auto">Real content line 4</span>
        <div id="level3-container">
          <a role="link" href="/@author1">author1</a>
          <span dir="auto">author1</span>
          <span dir="auto">2026-1-9</span>
          <div id="level2-container">
            <span dir="auto">AI IDE</span>
            <span dir="auto">2025-9-23</span>
            <div id="level1-container">
              <span dir="auto">2025-9-23</span>
              <a id="time-link" role="link" href="/post/ABC123">2025-9-23</a>
            </div>
          </div>
        </div>
      </div>
    `;

    const timeLink = asElement(document.getElementById("time-link"));
    const result = getPostContainer(timeLink);

    expect(result).not.toBeNull();
    // 應該選擇 level3 或更高（有作者的容器），而非 level1-2（沒有作者）
    const authorLinks = result!.querySelectorAll('a[role="link"][href^="/@"]');
    expect(authorLinks.length).toBeGreaterThanOrEqual(1);
  });

  test("prefers ideal range container (4-20 spans) over small container (2-3 spans)", () => {
    // 模擬串文頁面主貼文結構
    // 問題：Level 3 只有作者+日期（2 spans），Level 6 有完整內容（12 spans）
    document.body.innerHTML = `
      <div id="level6-container">
        <a role="link" href="/@author1">author1</a>
        <span dir="auto">author1</span>
        <span dir="auto">2026-1-9</span>
        <span dir="auto">We just open sourced the code-simplifier agent</span>
        <span dir="auto">Try it: claude plugin install code-simplifier</span>
        <span dir="auto">Or from within a session</span>
        <span dir="auto">Ask Claude to use the code simplifier agent</span>
        <span dir="auto">1,280</span>
        <span dir="auto">54</span>
        <span dir="auto">124</span>
        <span dir="auto">341</span>
        <span dir="auto">熱門</span>
        <div id="level3-container">
          <a role="link" href="/@author1">author1</a>
          <span dir="auto">author1</span>
          <span dir="auto">2026-1-9</span>
          <a id="time-link" role="link" href="/post/ABC123">2026-1-9</a>
        </div>
      </div>
    `;

    const timeLink = asElement(document.getElementById("time-link"));
    const result = getPostContainer(timeLink);

    expect(result).not.toBeNull();
    // 應該選擇 level6（12 spans，在理想範圍 4-20），而非 level3（2 spans）
    const contentSpans = result!.querySelectorAll('span[dir="auto"]');
    expect(contentSpans.length).toBeGreaterThanOrEqual(4);
    // 確認容器包含實際的貼文內容
    const containerText = result!.textContent || "";
    expect(containerText).toContain("code-simplifier");
  });

  test("handles container with only author and date (should go to larger container)", () => {
    // 回覆貼文的結構：小容器只有作者+日期，需要往上找更大的容器
    document.body.innerHTML = `
      <div id="outer-container">
        <a role="link" href="/@replier">replier</a>
        <span dir="auto">replier</span>
        <span dir="auto">2026-1-9</span>
        <span dir="auto">This is my reply to the post</span>
        <span dir="auto">Very interesting discussion!</span>
        <div id="inner-container">
          <a role="link" href="/@replier">replier</a>
          <span dir="auto">replier</span>
          <span dir="auto">2026-1-9</span>
          <a id="time-link" role="link" href="/post/REPLY123">2026-1-9</a>
        </div>
      </div>
    `;

    const timeLink = asElement(document.getElementById("time-link"));
    const result = getPostContainer(timeLink);

    expect(result).not.toBeNull();
    // 確認選擇了包含實際回覆內容的容器
    const containerText = result!.textContent || "";
    expect(containerText).toContain("This is my reply");
  });
});

// =============================================================================
// extractInteractionCounts() Tests - 6 cases
// =============================================================================
describe("extractInteractionCounts", () => {
  let window: Window;
  let document: Window["document"];

  beforeEach(() => {
    window = new Window();
    document = window.document;
    // @ts-expect-error - happy-dom mock
    globalThis.window = window;
  });

  afterEach(() => {
    window.close();
    // @ts-expect-error - happy-dom cleanup
    globalThis.window = undefined;
  });

  test("extracts likes count", () => {
    document.body.innerHTML = `
      <div id="container">
        <div role="button">讚123</div>
      </div>
    `;
    const container = asElement(document.getElementById("container"));
    const counts = extractInteractionCounts(container);
    expect(counts.likes).toBe(123);
  });

  test("extracts likes with Chinese unit (萬)", () => {
    document.body.innerHTML = `
      <div id="container">
        <div role="button">讚1.6 萬</div>
      </div>
    `;
    const container = asElement(document.getElementById("container"));
    const counts = extractInteractionCounts(container);
    expect(counts.likes).toBe(16000);
  });

  test("extracts replies count", () => {
    document.body.innerHTML = `
      <div id="container">
        <div role="button">回覆42</div>
      </div>
    `;
    const container = asElement(document.getElementById("container"));
    const counts = extractInteractionCounts(container);
    expect(counts.replies).toBe(42);
  });

  test("extracts reposts count", () => {
    document.body.innerHTML = `
      <div id="container">
        <div role="button">轉發99</div>
      </div>
    `;
    const container = asElement(document.getElementById("container"));
    const counts = extractInteractionCounts(container);
    expect(counts.reposts).toBe(99);
  });

  test("extracts shares count with comma", () => {
    document.body.innerHTML = `
      <div id="container">
        <div role="button">分享2,713</div>
      </div>
    `;
    const container = asElement(document.getElementById("container"));
    const counts = extractInteractionCounts(container);
    expect(counts.shares).toBe(2713);
  });

  test("extracts all interaction counts together", () => {
    document.body.innerHTML = `
      <div id="container">
        <div role="button">讚1.5萬</div>
        <div role="button">回覆100</div>
        <div role="button">轉發50</div>
        <div role="button">分享25</div>
      </div>
    `;
    const container = asElement(document.getElementById("container"));
    const counts = extractInteractionCounts(container);
    expect(counts.likes).toBe(15000);
    expect(counts.replies).toBe(100);
    expect(counts.reposts).toBe(50);
    expect(counts.shares).toBe(25);
  });

  // English version tests
  test("extracts English likes count", () => {
    document.body.innerHTML = `
      <div id="container">
        <div role="button">Like456</div>
      </div>
    `;
    const container = asElement(document.getElementById("container"));
    const counts = extractInteractionCounts(container);
    expect(counts.likes).toBe(456);
  });

  test("extracts English likes with K unit", () => {
    document.body.innerHTML = `
      <div id="container">
        <div role="button">Like5.5K</div>
      </div>
    `;
    const container = asElement(document.getElementById("container"));
    const counts = extractInteractionCounts(container);
    expect(counts.likes).toBe(5500);
  });

  test("extracts English Reply count", () => {
    document.body.innerHTML = `
      <div id="container">
        <div role="button">Reply214</div>
      </div>
    `;
    const container = asElement(document.getElementById("container"));
    const counts = extractInteractionCounts(container);
    expect(counts.replies).toBe(214);
  });

  test("extracts English Repost count", () => {
    document.body.innerHTML = `
      <div id="container">
        <div role="button">Repost15</div>
      </div>
    `;
    const container = asElement(document.getElementById("container"));
    const counts = extractInteractionCounts(container);
    expect(counts.reposts).toBe(15);
  });

  test("extracts English Share count", () => {
    document.body.innerHTML = `
      <div id="container">
        <div role="button">Share98</div>
      </div>
    `;
    const container = asElement(document.getElementById("container"));
    const counts = extractInteractionCounts(container);
    expect(counts.shares).toBe(98);
  });
});

// =============================================================================
// extractPostData() Integration Tests - 12 cases
// =============================================================================
describe("extractPostData", () => {
  let window: Window;
  let document: Window["document"];

  beforeEach(() => {
    window = new Window();
    document = window.document;
    // @ts-expect-error - happy-dom mock
    globalThis.window = window;
    // @ts-expect-error - happy-dom mock
    globalThis.document = document;
  });

  afterEach(() => {
    window.close();
    // @ts-expect-error - happy-dom cleanup
    globalThis.window = undefined;
    // @ts-expect-error - happy-dom cleanup
    globalThis.document = undefined;
  });

  function createPostDOM(options: {
    postId?: string;
    author?: string;
    content?: string;
    timeText?: string;
    withQuote?: boolean;
    quoteContent?: string;
  }): Element {
    const {
      postId = "ABC123",
      author = "testuser",
      content = "Hello world",
      timeText = "2天",
      withQuote = false,
      quoteContent = "Quoted content",
    } = options;

    // Structure mimics real Threads DOM where quote block is nested
    // but the main author link is in an outer container
    const html = withQuote
      ? `
      <div id="outer">
        <div id="post-container">
          <a role="link" href="/@${author}">@${author}</a>
          <span dir="auto">${content}</span>
          <div id="quote-wrapper" style="border: 1px solid black; border-top: 1px solid black; border-right: 1px solid black; border-bottom: 1px solid black;">
            <span dir="auto">${quoteContent}</span>
          </div>
          <a id="post-link" role="link" href="/t/@${author}/post/${postId}">${timeText}</a>
        </div>
      </div>
    `
      : `
      <div id="post-container">
        <a role="link" href="/@${author}">@${author}</a>
        <span dir="auto">${content}</span>
        <a id="post-link" role="link" href="/t/@${author}/post/${postId}">${timeText}</a>
      </div>
    `;

    document.body.innerHTML = html;
    return asElement(document.getElementById("post-link"));
  }

  test("returns null when href is missing", () => {
    document.body.innerHTML = '<a id="link" role="link">2天</a>';
    const link = asElement(document.getElementById("link"));
    expect(extractPostData(link)).toBeNull();
  });

  test("returns null when post ID cannot be extracted", () => {
    document.body.innerHTML = '<a id="link" role="link" href="/@user/invalid">2天</a>';
    const link = asElement(document.getElementById("link"));
    expect(extractPostData(link)).toBeNull();
  });

  test("returns null when link is not a time link", () => {
    document.body.innerHTML = `
      <div>
        <a role="link" href="/@testuser">@testuser</a>
        <span dir="auto">Content</span>
        <a id="link" role="link" href="/t/@testuser/post/ABC123">這是一段很長的內容連結</a>
      </div>
    `;
    const link = asElement(document.getElementById("link"));
    expect(extractPostData(link)).toBeNull();
  });

  test("returns null when no container found", () => {
    document.body.innerHTML = `
      <a id="link" role="link" href="/t/@testuser/post/ABC123">2天</a>
    `;
    const link = asElement(document.getElementById("link"));
    expect(extractPostData(link)).toBeNull();
  });

  test("extracts basic post data correctly", () => {
    const link = createPostDOM({});
    const result = extractPostData(link);

    expect(result).not.toBeNull();
    expect(result!.id).toBe("ABC123");
    expect(result!.author).toBe("testuser");
    expect(result!.content).toBe("Hello world");
    expect(result!.url).toBe("https://www.threads.com/t/@testuser/post/ABC123");
  });

  test("extracts post with different author", () => {
    const link = createPostDOM({ author: "anotheruser", postId: "XYZ789" });
    const result = extractPostData(link);

    expect(result).not.toBeNull();
    expect(result!.id).toBe("XYZ789");
    expect(result!.author).toBe("anotheruser");
  });

  test("extracts post with multiline content", () => {
    const link = createPostDOM({ content: "Line 1" });
    const result = extractPostData(link);

    expect(result).not.toBeNull();
    expect(result!.content).toContain("Line 1");
  });

  test("excludes quoted content from main content", () => {
    const link = createPostDOM({
      content: "Main content",
      withQuote: true,
      quoteContent: "This should be excluded",
    });
    const result = extractPostData(link);

    expect(result).not.toBeNull();
    expect(result!.content).toBe("Main content");
    expect(result!.content).not.toContain("This should be excluded");
  });

  test("extracts author correctly when quote block is present", () => {
    const link = createPostDOM({
      author: "mainuser",
      content: "Main post content",
      withQuote: true,
      quoteContent: "Quote block content",
    });
    const result = extractPostData(link);

    expect(result).not.toBeNull();
    expect(result!.author).toBe("mainuser");
  });

  test("returns post with seenAt timestamp", () => {
    const before = Date.now();
    const link = createPostDOM({});
    const result = extractPostData(link);
    const after = Date.now();

    expect(result).not.toBeNull();
    expect(result!.seenAt).toBeGreaterThanOrEqual(before);
    expect(result!.seenAt).toBeLessThanOrEqual(after);
  });

  test("initializes interaction counts to 0", () => {
    const link = createPostDOM({});
    const result = extractPostData(link);

    expect(result).not.toBeNull();
    expect(result!.likes).toBe(0);
    expect(result!.replies).toBe(0);
    expect(result!.reposts).toBe(0);
    expect(result!.shares).toBe(0);
  });

  test("removes trailing Translate from content", () => {
    const link = createPostDOM({ content: "Hello world  Translate" });
    const result = extractPostData(link);

    expect(result).not.toBeNull();
    expect(result!.content).toBe("Hello world");
    expect(result!.content).not.toContain("Translate");
  });

  test("removes trailing 1/2 pagination from content", () => {
    const link = createPostDOM({ content: "Hello world 1/2" });
    const result = extractPostData(link);

    expect(result).not.toBeNull();
    expect(result!.content).toBe("Hello world");
    expect(result!.content).not.toContain("1/2");
  });

  test("removes both Translate and pagination from content", () => {
    const link = createPostDOM({ content: "Hello world  Translate 1/2" });
    const result = extractPostData(link);

    expect(result).not.toBeNull();
    expect(result!.content).toBe("Hello world");
  });

  test("works with English time format", () => {
    const link = createPostDOM({ timeText: "2h", content: "English post" });
    const result = extractPostData(link);

    expect(result).not.toBeNull();
    expect(result!.content).toBe("English post");
  });

  test("returns null when content is empty", () => {
    document.body.innerHTML = `
      <div id="post-container">
        <a role="link" href="/@testuser">@testuser</a>
        <a id="link" role="link" href="/t/@testuser/post/ABC123">2天</a>
      </div>
    `;
    const link = asElement(document.getElementById("link"));
    expect(extractPostData(link)).toBeNull();
  });

  test("excludes ISO date format from content (2026-1-9)", () => {
    document.body.innerHTML = `
      <div id="post-container">
        <a role="link" href="/@testuser">@testuser</a>
        <span dir="auto">2026-1-9</span>
        <span dir="auto">This is the actual post content</span>
        <a id="link" role="link" href="/t/@testuser/post/ABC123">2026-1-9</a>
      </div>
    `;
    const link = asElement(document.getElementById("link"));
    const result = extractPostData(link);

    expect(result).not.toBeNull();
    expect(result!.content).toBe("This is the actual post content");
    expect(result!.content).not.toContain("2026-1-9");
  });

  test("excludes full ISO date format from content (2025-11-28)", () => {
    document.body.innerHTML = `
      <div id="post-container">
        <a role="link" href="/@testuser">@testuser</a>
        <span dir="auto">2025-11-28</span>
        <span dir="auto">Post content goes here</span>
        <a id="link" role="link" href="/t/@testuser/post/ABC123">2025-11-28</a>
      </div>
    `;
    const link = asElement(document.getElementById("link"));
    const result = extractPostData(link);

    expect(result).not.toBeNull();
    expect(result!.content).toBe("Post content goes here");
    expect(result!.content).not.toContain("2025-11-28");
  });

  test("works with ISO date format time link (2026-1-9)", () => {
    document.body.innerHTML = `
      <div id="post-container">
        <a role="link" href="/@testuser">@testuser</a>
        <span dir="auto">Hello from the future!</span>
        <a id="link" role="link" href="/t/@testuser/post/ABC123">2026-1-9</a>
      </div>
    `;
    const link = asElement(document.getElementById("link"));
    const result = extractPostData(link);

    expect(result).not.toBeNull();
    expect(result!.content).toBe("Hello from the future!");
    expect(result!.id).toBe("ABC123");
    expect(result!.author).toBe("testuser");
  });

  test("handles multiple date spans at beginning", () => {
    document.body.innerHTML = `
      <div id="post-container">
        <a role="link" href="/@testuser">@testuser</a>
        <span dir="auto">2026-1-9</span>
        <span dir="auto">2025-12-31</span>
        <span dir="auto">Real content starts here</span>
        <span dir="auto">More content</span>
        <a id="link" role="link" href="/t/@testuser/post/ABC123">2026-1-9</a>
      </div>
    `;
    const link = asElement(document.getElementById("link"));
    const result = extractPostData(link);

    expect(result).not.toBeNull();
    expect(result!.content).not.toContain("2026-1-9");
    expect(result!.content).not.toContain("2025-12-31");
    expect(result!.content).toContain("Real content starts here");
    expect(result!.content).toContain("More content");
  });
});
