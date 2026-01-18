import { startObserving } from "./observers.ts";

// 等待 DOM 準備好後啟動觀察
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startObserving);
} else {
  startObserving();
}

console.log("[Threads Logger] Content script loaded");
