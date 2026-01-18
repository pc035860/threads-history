import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";

// Detect system dark mode
if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
  document.documentElement.classList.add("dark");
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(<App />);
}
