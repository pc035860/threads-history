/**
 * Message Passing Helper
 * Provides type-safe wrappers for communicating with Background Service Worker
 */

import type { ThreadPost } from "../../storage/types.ts";
import type {
  Message,
  MessageResponse,
  PostUpsertMessage,
  PostGetAllMessage,
  PostSearchMessage,
  PostClearMessage,
  PostGetCountMessage,
  PostsUpdateNotification,
} from "../../shared/messages.ts";
import { ErrorCode } from "../../shared/messages.ts";

/**
 * Send a message to Background Service Worker and await response
 */
async function sendMessage<T extends Message>(message: T): Promise<MessageResponse> {
  try {
    const response = await chrome.runtime.sendMessage(message);
    return response;
  } catch (error) {
    console.error("[Messaging] Failed to send message:", error);
    return {
      success: false,
      code: ErrorCode.NETWORK_ERROR,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Check if response is an error
 */
export function isError(
  response: MessageResponse
): response is { success: false; code: ErrorCode; error: string } {
  return (
    typeof response === "object" &&
    response !== null &&
    "success" in response &&
    response.success === false
  );
}

/**
 * Upsert a post
 */
export async function upsertPost(post: ThreadPost): Promise<void> {
  const message: PostUpsertMessage = {
    type: "POST_UPSERT",
    payload: post,
  };
  const response = await sendMessage(message);
  if (isError(response)) {
    throw new Error(response.error);
  }
}

/**
 * Get all posts
 */
export async function getAllPosts(): Promise<ThreadPost[]> {
  const message: PostGetAllMessage = {
    type: "POST_GET_ALL",
  };
  const response = await sendMessage(message);
  if (isError(response)) {
    throw new Error(response.error);
  }
  // Response should be ThreadPost[]
  return response as ThreadPost[];
}

/**
 * Search posts by keywords
 */
export async function searchPosts(keywords: string[]): Promise<ThreadPost[]> {
  const message: PostSearchMessage = {
    type: "POST_SEARCH",
    payload: { keywords },
  };
  const response = await sendMessage(message);
  if (isError(response)) {
    throw new Error(response.error);
  }
  // Response should be ThreadPost[]
  return response as ThreadPost[];
}

/**
 * Clear all posts
 */
export async function clearPosts(): Promise<void> {
  const message: PostClearMessage = {
    type: "POST_CLEAR",
  };
  const response = await sendMessage(message);
  if (isError(response)) {
    throw new Error(response.error);
  }
}

/**
 * Get post count
 */
export async function getPostCount(): Promise<number> {
  const message: PostGetCountMessage = {
    type: "POST_GET_COUNT",
  };
  const response = await sendMessage(message);
  if (isError(response)) {
    throw new Error(response.error);
  }
  // Response should be number
  return response as number;
}

/**
 * Subscribe to posts update notifications from Background
 * Returns an unsubscribe function
 */
export function subscribeToPostsUpdates(callback: () => void): () => void {
  const listener = (message: unknown) => {
    const notification = message as PostsUpdateNotification;
    if (notification?.type === "POSTS_UPDATED") {
      callback();
    }
  };

  chrome.runtime.onMessage.addListener(listener);

  // Return unsubscribe function
  return () => {
    chrome.runtime.onMessage.removeListener(listener);
  };
}
