import { describe, expect, test } from "bun:test";
import { upsertPost } from "./lru-storage.ts";
import type { ThreadPost } from "./types.ts";
import { MAX_POSTS } from "../shared/constants.ts";

function createPost(id: string, seenAt?: number): ThreadPost {
  return {
    id,
    url: `https://www.threads.com/t/@user/post/${id}`,
    author: "testuser",
    content: `Content for post ${id}`,
    likes: 0,
    replies: 0,
    reposts: 0,
    shares: 0,
    seenAt: seenAt ?? Date.now(),
  };
}

// =============================================================================
// upsertPost() Tests - 8 cases
// =============================================================================
describe("upsertPost", () => {
  describe("new post insertion", () => {
    test("inserts new post at the beginning of empty list", () => {
      const posts: ThreadPost[] = [];
      const newPost = createPost("A");

      const result = upsertPost(posts, newPost);

      expect(result.length).toBe(1);
      expect(result.at(0)?.id).toBe("A");
    });

    test("inserts new post at the beginning of non-empty list", () => {
      const posts = [createPost("B"), createPost("C")];
      const newPost = createPost("A");

      const result = upsertPost(posts, newPost);

      expect(result.length).toBe(3);
      expect(result.at(0)?.id).toBe("A");
      expect(result.at(1)?.id).toBe("B");
      expect(result.at(2)?.id).toBe("C");
    });
  });

  describe("duplicate post handling (LRU)", () => {
    test("moves duplicate post to the front", () => {
      const posts = [createPost("A"), createPost("B"), createPost("C")];
      const duplicatePost = createPost("C");

      const result = upsertPost(posts, duplicatePost);

      expect(result.length).toBe(3);
      expect(result.at(0)?.id).toBe("C");
      expect(result.at(1)?.id).toBe("A");
      expect(result.at(2)?.id).toBe("B");
    });

    test("updates seenAt when moving duplicate to front", () => {
      const oldSeenAt = Date.now() - 10000;
      const posts = [createPost("A", oldSeenAt)];
      const duplicatePost = createPost("A");

      const before = Date.now();
      const result = upsertPost(posts, duplicatePost);
      const after = Date.now();

      const firstPost = result.at(0);
      expect(firstPost).toBeDefined();
      expect(firstPost!.seenAt).toBeGreaterThanOrEqual(before);
      expect(firstPost!.seenAt).toBeLessThanOrEqual(after);
    });

    test("handles duplicate in the middle of list", () => {
      const posts = [createPost("A"), createPost("B"), createPost("C"), createPost("D")];
      const duplicatePost = createPost("B");

      const result = upsertPost(posts, duplicatePost);

      expect(result.length).toBe(4);
      expect(result.at(0)?.id).toBe("B");
      expect(result.at(1)?.id).toBe("A");
      expect(result.at(2)?.id).toBe("C");
      expect(result.at(3)?.id).toBe("D");
    });
  });

  describe("MAX_POSTS truncation", () => {
    test("truncates list to MAX_POSTS when exceeding limit", () => {
      // Create MAX_POSTS items
      const posts: ThreadPost[] = [];
      for (let i = 0; i < MAX_POSTS; i++) {
        posts.push(createPost(`post-${i}`));
      }

      // Add one more
      const newPost = createPost("new-post");
      const result = upsertPost(posts, newPost);

      expect(result.length).toBe(MAX_POSTS);
      expect(result.at(0)?.id).toBe("new-post");
      // Last post should be removed
      expect(result.some((p) => p.id === `post-${MAX_POSTS - 1}`)).toBe(false);
    });

    test("keeps oldest posts when at exactly MAX_POSTS", () => {
      const posts: ThreadPost[] = [];
      for (let i = 0; i < MAX_POSTS - 1; i++) {
        posts.push(createPost(`post-${i}`));
      }

      const newPost = createPost("new-post");
      const result = upsertPost(posts, newPost);

      expect(result.length).toBe(MAX_POSTS);
      expect(result.at(0)?.id).toBe("new-post");
      expect(result.at(MAX_POSTS - 1)?.id).toBe(`post-${MAX_POSTS - 2}`);
    });

    test("does not remove items when updating duplicate at MAX_POSTS", () => {
      const posts: ThreadPost[] = [];
      for (let i = 0; i < MAX_POSTS; i++) {
        posts.push(createPost(`post-${i}`));
      }

      // Update existing post (should not remove any)
      const duplicatePost = createPost("post-500");
      const result = upsertPost(posts, duplicatePost);

      expect(result.length).toBe(MAX_POSTS);
      expect(result.at(0)?.id).toBe("post-500");
      // All original posts should still exist
      expect(result.some((p) => p.id === "post-0")).toBe(true);
      expect(result.some((p) => p.id === `post-${MAX_POSTS - 1}`)).toBe(true);
    });
  });
});
