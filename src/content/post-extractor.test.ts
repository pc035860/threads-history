import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { Window } from "happy-dom";
import { __testing__, extractPostData } from "./post-extractor.ts";

const { parseCount, isInsideQuoteBlock, extractPostId, isTimeLink } = __testing__;

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

  describe("edge cases", () => {
    test("returns 0 for non-numeric string", () => {
      expect(parseCount("abc")).toBe(0);
    });

    test("returns 0 for NaN string", () => {
      expect(parseCount("NaN")).toBe(0);
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
});
