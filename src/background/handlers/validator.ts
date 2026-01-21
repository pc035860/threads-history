/**
 * Payload Validator
 * Validates incoming message payloads to ensure data integrity
 */

import type { ThreadPost } from "../../storage/types.ts";

/**
 * Validation error
 */
export class ValidationError extends Error {
  constructor(message: string) {
    super(`Validation error: ${message}`);
    this.name = "ValidationError";
  }
}

/**
 * Validate post ID format
 * Post IDs should be non-empty alphanumeric strings
 */
function validatePostId(id: string): void {
  if (typeof id !== "string") {
    throw new ValidationError("Post ID must be a string");
  }
  if (id.length === 0) {
    throw new ValidationError("Post ID cannot be empty");
  }
  if (id.length > 100) {
    throw new ValidationError("Post ID is too long");
  }
}

/**
 * Validate URL format and domain
 * Must be a valid threads.com URL
 */
function validatePostUrl(url: string): void {
  if (typeof url !== "string") {
    throw new ValidationError("Post URL must be a string");
  }
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== "www.threads.com") {
      throw new ValidationError("Post URL must be from www.threads.com");
    }
    if (!parsed.pathname.includes("/post/")) {
      throw new ValidationError("Post URL must contain /post/ path");
    }
  } catch {
    throw new ValidationError("Post URL is invalid");
  }
}

/**
 * Validate author username
 */
function validateAuthor(author: string): void {
  if (typeof author !== "string") {
    throw new ValidationError("Author must be a string");
  }
  if (author.length > 100) {
    throw new ValidationError("Author is too long");
  }
}

/**
 * Validate content
 */
function validateContent(content: string): void {
  if (typeof content !== "string") {
    throw new ValidationError("Content must be a string");
  }
  if (content.length > 100_000) {
    throw new ValidationError("Content is too long (>100KB)");
  }
}

/**
 * Validate numeric counts (likes, replies, reposts, shares)
 */
function validateCount(value: number, fieldName: string): void {
  if (typeof value !== "number") {
    throw new ValidationError(`${fieldName} must be a number`);
  }
  if (!Number.isFinite(value)) {
    throw new ValidationError(`${fieldName} must be finite`);
  }
  if (value < 0) {
    throw new ValidationError(`${fieldName} cannot be negative`);
  }
  if (value > 1_000_000_000) {
    throw new ValidationError(`${fieldName} is too large`);
  }
}

/**
 * Validate timestamp
 */
function validateTimestamp(timestamp: number): void {
  if (typeof timestamp !== "number") {
    throw new ValidationError("Timestamp must be a number");
  }
  if (!Number.isFinite(timestamp)) {
    throw new ValidationError("Timestamp must be finite");
  }
  // Check reasonable range (year 2000 to year 2100)
  if (timestamp < 946_684_800_000 || timestamp > 4_102_444_800_000) {
    throw new ValidationError("Timestamp is out of valid range");
  }
}

/**
 * Validate a ThreadPost object
 */
export function validateThreadPost(post: unknown): ThreadPost {
  if (typeof post !== "object" || post === null) {
    throw new ValidationError("Post must be an object");
  }

  const p = post as Partial<ThreadPost>;

  // Check required fields
  if (p.id === undefined) {
    throw new ValidationError("Post missing 'id' field");
  }
  if (p.url === undefined) {
    throw new ValidationError("Post missing 'url' field");
  }
  if (p.author === undefined) {
    throw new ValidationError("Post missing 'author' field");
  }
  if (p.content === undefined) {
    throw new ValidationError("Post missing 'content' field");
  }
  if (p.likes === undefined) {
    throw new ValidationError("Post missing 'likes' field");
  }
  if (p.replies === undefined) {
    throw new ValidationError("Post missing 'replies' field");
  }
  if (p.reposts === undefined) {
    throw new ValidationError("Post missing 'reposts' field");
  }
  if (p.shares === undefined) {
    throw new ValidationError("Post missing 'shares' field");
  }
  if (p.seenAt === undefined) {
    throw new ValidationError("Post missing 'seenAt' field");
  }

  // Validate each field
  validatePostId(p.id);
  validatePostUrl(p.url);
  validateAuthor(p.author);
  validateContent(p.content);
  validateCount(p.likes, "likes");
  validateCount(p.replies, "replies");
  validateCount(p.reposts, "reposts");
  validateCount(p.shares, "shares");
  validateTimestamp(p.seenAt);

  // Return validated post
  return p as ThreadPost;
}

/**
 * Validate search keywords
 */
export function validateSearchKeywords(keywords: unknown): string[] {
  if (!Array.isArray(keywords)) {
    throw new ValidationError("Keywords must be an array");
  }
  for (const kw of keywords) {
    if (typeof kw !== "string") {
      throw new ValidationError("Each keyword must be a string");
    }
    if (kw.length > 100) {
      throw new ValidationError("Keyword is too long");
    }
  }
  return keywords as string[];
}
