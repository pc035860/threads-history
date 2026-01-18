import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { renderHook, act, cleanup } from "@testing-library/react";
import { Window } from "happy-dom";
import { useSearch } from "./useSearch.ts";
import type { ThreadPost } from "../../storage/types.ts";

// Setup happy-dom for React testing
let window: Window;

beforeAll(() => {
  window = new Window();
  // @ts-expect-error - mock global
  globalThis.window = window;
  // @ts-expect-error - mock global
  globalThis.document = window.document;
  // @ts-expect-error - mock global
  globalThis.navigator = window.navigator;
  // @ts-expect-error - mock global
  globalThis.HTMLElement = window.HTMLElement;
  // @ts-expect-error - mock global
  globalThis.Element = window.Element;
});

afterAll(() => {
  cleanup();
  window.close();
});

function createPost(id: string, author: string, content: string): ThreadPost {
  return {
    id,
    url: `https://www.threads.com/t/@${author}/post/${id}`,
    author,
    content,
    likes: 0,
    replies: 0,
    reposts: 0,
    shares: 0,
    seenAt: Date.now(),
  };
}

const samplePosts: ThreadPost[] = [
  createPost("1", "alice", "Hello world from Alice"),
  createPost("2", "bob", "React is awesome"),
  createPost("3", "charlie", "TypeScript tips and tricks"),
  createPost("4", "alice", "Another post about JavaScript"),
  createPost("5", "david", "Hello everyone, greetings from David"),
];

// =============================================================================
// useSearch() Tests - 10 cases
// =============================================================================
describe("useSearch", () => {
  describe("empty query behavior", () => {
    test("returns all posts when query is empty", () => {
      const { result } = renderHook(() => useSearch(samplePosts));

      expect(result.current.query).toBe("");
      expect(result.current.filtered).toEqual(samplePosts);
      expect(result.current.filtered.length).toBe(5);
    });

    test("returns all posts when query is whitespace only", () => {
      const { result } = renderHook(() => useSearch(samplePosts));

      act(() => {
        result.current.setQuery("   ");
      });

      expect(result.current.filtered).toEqual(samplePosts);
    });
  });

  describe("single keyword search", () => {
    test("filters by author name", () => {
      const { result } = renderHook(() => useSearch(samplePosts));

      act(() => {
        result.current.setQuery("alice");
      });

      expect(result.current.filtered.length).toBe(2);
      expect(result.current.filtered.every((p) => p.author === "alice")).toBe(true);
    });

    test("filters by content keyword", () => {
      const { result } = renderHook(() => useSearch(samplePosts));

      act(() => {
        result.current.setQuery("Hello");
      });

      expect(result.current.filtered.length).toBe(2);
      expect(result.current.filtered.at(0)?.id).toBe("1");
      expect(result.current.filtered.at(1)?.id).toBe("5");
    });

    test("is case-insensitive", () => {
      const { result } = renderHook(() => useSearch(samplePosts));

      act(() => {
        result.current.setQuery("REACT");
      });

      expect(result.current.filtered.length).toBe(1);
      expect(result.current.filtered.at(0)?.id).toBe("2");
    });
  });

  describe("multi-keyword AND search", () => {
    test("filters with two keywords (AND logic)", () => {
      const { result } = renderHook(() => useSearch(samplePosts));

      act(() => {
        result.current.setQuery("alice javascript");
      });

      expect(result.current.filtered.length).toBe(1);
      expect(result.current.filtered.at(0)?.id).toBe("4");
    });

    test("filters with three keywords (AND logic)", () => {
      const { result } = renderHook(() => useSearch(samplePosts));

      act(() => {
        result.current.setQuery("hello world alice");
      });

      expect(result.current.filtered.length).toBe(1);
      expect(result.current.filtered.at(0)?.id).toBe("1");
    });

    test("returns empty when no posts match all keywords", () => {
      const { result } = renderHook(() => useSearch(samplePosts));

      act(() => {
        result.current.setQuery("alice react");
      });

      expect(result.current.filtered.length).toBe(0);
    });
  });

  describe("edge cases", () => {
    test("handles empty posts array", () => {
      const { result } = renderHook(() => useSearch([]));

      act(() => {
        result.current.setQuery("test");
      });

      expect(result.current.filtered.length).toBe(0);
    });

    test("updates filtered when posts change", () => {
      const { result, rerender } = renderHook(({ posts }) => useSearch(posts), {
        initialProps: { posts: samplePosts },
      });

      act(() => {
        result.current.setQuery("alice");
      });

      expect(result.current.filtered.length).toBe(2);

      // Add a new post
      const updatedPosts = [...samplePosts, createPost("6", "alice", "Third post from Alice")];

      rerender({ posts: updatedPosts });

      expect(result.current.filtered.length).toBe(3);
    });
  });
});
