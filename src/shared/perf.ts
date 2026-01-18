/**
 * Performance Debug Utility
 * 使用 debug.ts 的 DEBUG 變數來控制是否啟用計時功能
 */
import { debug, DEBUG } from "./debug.ts";

const marks = new Map<string, number>();

/**
 * 開始計時
 * @param name 計時名稱
 */
export function startMark(name: string): void {
  if (!DEBUG) return;
  marks.set(name, performance.now());
  debug.log(`[Perf] ${name}: 開始...`);
}

/**
 * 結束計時並輸出耗時
 * @param name 計時名稱（需與 startMark 對應）
 * @param metadata 額外資訊（會顯示在 log 中）
 */
export function endMark(name: string, metadata?: string): void {
  if (!DEBUG) return;
  const start = marks.get(name);
  if (start === undefined) {
    debug.warn(`[Perf] ${name}: 沒有對應的 startMark`);
    return;
  }
  const duration = performance.now() - start;
  debug.log(`[Perf] ${name}${metadata ? ` - ${metadata}` : ""}: 耗時 ${duration.toFixed(2)}ms`);
  marks.delete(name);
}

/**
 * 測量非同步操作耗時
 * @param name 計時名稱
 * @param fn 要測量的非同步函式
 */
export async function measureAsync<T>(name: string, fn: () => Promise<T>): Promise<T> {
  if (!DEBUG) {
    return fn();
  }
  const start = performance.now();
  debug.log(`[Perf] ${name}: 開始...`);
  try {
    const result = await fn();
    const duration = performance.now() - start;
    debug.log(`[Perf] ${name}: 耗時 ${duration.toFixed(2)}ms`);
    return result;
  } catch (error) {
    const duration = performance.now() - start;
    debug.error(`[Perf] ${name}: 失敗（耗時 ${duration.toFixed(2)}ms）`, error);
    throw error;
  }
}
