import { startObserving } from "./observers.ts";
import { debug } from "../shared/debug.ts";

// 等待 DOM 準備好後啟動觀察
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startObserving);
} else {
  startObserving();
}

debug.log("Content script loaded");
