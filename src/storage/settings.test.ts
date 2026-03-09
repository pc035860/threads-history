import { describe, expect, test } from "bun:test";
import { normalizeMaxPosts, normalizeSettings } from "./settings.ts";
import { DEFAULT_MAX_POSTS, MIN_MAX_POSTS, MAX_MAX_POSTS } from "../shared/constants.ts";

describe("normalizeMaxPosts", () => {
  test("returns default for non-numeric values", () => {
    expect(normalizeMaxPosts(undefined)).toBe(DEFAULT_MAX_POSTS);
    expect(normalizeMaxPosts(Number.NaN)).toBe(DEFAULT_MAX_POSTS);
  });

  test("clamps values below the minimum", () => {
    expect(normalizeMaxPosts(0)).toBe(MIN_MAX_POSTS);
    expect(normalizeMaxPosts(99)).toBe(MIN_MAX_POSTS);
  });

  test("clamps values above the maximum", () => {
    expect(normalizeMaxPosts(10001)).toBe(MAX_MAX_POSTS);
  });

  test("rounds finite numeric values", () => {
    expect(normalizeMaxPosts(1234.4)).toBe(1234);
    expect(normalizeMaxPosts(1234.6)).toBe(1235);
  });
});

describe("normalizeSettings", () => {
  test("fills missing settings with defaults", () => {
    expect(normalizeSettings()).toEqual({ maxPosts: DEFAULT_MAX_POSTS });
  });

  test("normalizes maxPosts from partial settings", () => {
    expect(normalizeSettings({ maxPosts: 50 })).toEqual({ maxPosts: MIN_MAX_POSTS });
  });
});
