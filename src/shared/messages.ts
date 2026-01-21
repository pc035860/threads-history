/**
 * Message Types for Chrome Extension Message Passing
 * Between Content Script / Popup and Background Service Worker
 */

import type { ThreadPost } from "../storage/types.ts";

// ============================================================================
// Message Types (discriminated union)
// ============================================================================

// Request messages (sent to background service worker)
export type Message =
  | PostUpsertMessage
  | PostGetAllMessage
  | PostSearchMessage
  | PostClearMessage
  | PostGetCountMessage;

// Notification messages (sent from background to popup, not handled by router)
export type NotificationMessage = PostsUpdateNotification;

// All message types
export type AllMessage = Message | NotificationMessage;

// ============================================================================
// Message Payloads
// ============================================================================

export interface PostUpsertMessage {
  type: "POST_UPSERT";
  payload: ThreadPost;
}

export interface PostGetAllMessage {
  type: "POST_GET_ALL";
  payload?: undefined;
}

export interface PostSearchMessage {
  type: "POST_SEARCH";
  payload: {
    keywords: string[];
  };
}

export interface PostClearMessage {
  type: "POST_CLEAR";
  payload?: undefined;
}

export interface PostGetCountMessage {
  type: "POST_GET_COUNT";
  payload?: undefined;
}

// Background → Popup notifications (not a request, just a notification)
export interface PostsUpdateNotification {
  type: "POSTS_UPDATED";
  payload?: undefined;
}

// ============================================================================
// Error Codes (machine-readable)
// ============================================================================

export enum ErrorCode {
  // Retryable errors
  MIGRATION_IN_PROGRESS = "MIGRATION_IN_PROGRESS",
  NETWORK_ERROR = "NETWORK_ERROR",

  // Non-retryable errors
  VALIDATION_ERROR = "VALIDATION_ERROR",
  INVALID_MESSAGE_FORMAT = "INVALID_MESSAGE_FORMAT",
  UNKNOWN_ERROR = "UNKNOWN_ERROR",
}

// ============================================================================
// Response Types
// ============================================================================

export type SuccessResponse = void; // POST_UPSERT, POST_CLEAR

export type ErrorResponse = {
  success: false;
  code: ErrorCode;
  error: string;
};

export type MessageResponse =
  | ThreadPost[] // POST_GET_ALL, POST_SEARCH
  | number // POST_GET_COUNT
  | SuccessResponse
  | ErrorResponse;

// ============================================================================
// Message Guards
// ============================================================================

export function isPostUpsertMessage(msg: unknown): msg is PostUpsertMessage {
  return (
    typeof msg === "object" &&
    msg !== null &&
    "type" in msg &&
    msg.type === "POST_UPSERT" &&
    "payload" in msg
  );
}

export function isPostGetAllMessage(msg: unknown): msg is PostGetAllMessage {
  return typeof msg === "object" && msg !== null && "type" in msg && msg.type === "POST_GET_ALL";
}

export function isPostSearchMessage(msg: unknown): msg is PostSearchMessage {
  return (
    typeof msg === "object" &&
    msg !== null &&
    "type" in msg &&
    msg.type === "POST_SEARCH" &&
    "payload" in msg &&
    typeof msg.payload === "object" &&
    msg.payload !== null &&
    "keywords" in msg.payload &&
    Array.isArray(msg.payload.keywords)
  );
}

export function isPostClearMessage(msg: unknown): msg is PostClearMessage {
  return typeof msg === "object" && msg !== null && "type" in msg && msg.type === "POST_CLEAR";
}

export function isPostGetCountMessage(msg: unknown): msg is PostGetCountMessage {
  return typeof msg === "object" && msg !== null && "type" in msg && msg.type === "POST_GET_COUNT";
}

export function isValidMessage(msg: unknown): msg is Message {
  return (
    isPostUpsertMessage(msg) ||
    isPostGetAllMessage(msg) ||
    isPostSearchMessage(msg) ||
    isPostClearMessage(msg) ||
    isPostGetCountMessage(msg)
  );
}
