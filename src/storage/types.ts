export interface ThreadPost {
  id: string; // post ID (from URL)
  url: string; // 完整連結
  author: string;
  content: string;
  likes: number;
  replies: number;
  reposts: number;
  shares: number;
  seenAt: number; // timestamp
}

export interface StorageData {
  posts: ThreadPost[];
}
