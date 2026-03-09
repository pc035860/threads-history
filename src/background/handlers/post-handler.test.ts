import { describe, expect, test } from "bun:test";
import type { ThreadPost } from "../../storage/types.ts";
import { getOverflowPostIds } from "./post-handler.ts";

function createPost(id: string, seenAt: number): ThreadPost {
  return {
    id,
    url: `https://www.threads.com/t/@user/post/${id}`,
    author: "testuser",
    content: `Content for post ${id}`,
    likes: 0,
    replies: 0,
    reposts: 0,
    shares: 0,
    seenAt,
  };
}

describe("getOverflowPostIds", () => {
  test("returns no ids when post count is within limit", () => {
    const posts = [createPost("A", 300), createPost("B", 200), createPost("C", 100)];

    expect(getOverflowPostIds(posts, 3)).toEqual([]);
  });

  test("returns oldest ids beyond the limit", () => {
    const posts = [
      createPost("A", 500),
      createPost("B", 400),
      createPost("C", 300),
      createPost("D", 200),
      createPost("E", 100),
    ];

    expect(getOverflowPostIds(posts, 3)).toEqual(["D", "E"]);
  });

  test("returns every excess id when the limit is lowered sharply", () => {
    const posts = [
      createPost("A", 500),
      createPost("B", 400),
      createPost("C", 300),
      createPost("D", 200),
      createPost("E", 100),
    ];

    expect(getOverflowPostIds(posts, 1)).toEqual(["B", "C", "D", "E"]);
  });
});
