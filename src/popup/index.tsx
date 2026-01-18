import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { startMark } from "../shared/perf.ts";

// Performance: 標記 popup 載入開始時間
startMark("popup-load");

// Detect system dark mode
if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
  document.documentElement.classList.add("dark");
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(<App />);
}
