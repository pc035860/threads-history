import { copyFile, mkdir, rm, cp } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

const DIST_DIR = "dist";

async function clean() {
  if (existsSync(DIST_DIR)) {
    await rm(DIST_DIR, { recursive: true });
  }
  await mkdir(DIST_DIR);
  await mkdir(path.join(DIST_DIR, "popup"));
  await mkdir(path.join(DIST_DIR, "popup", "styles"));
  await mkdir(path.join(DIST_DIR, "content"));
  await mkdir(path.join(DIST_DIR, "background"));
  await mkdir(path.join(DIST_DIR, "icons"));
}

async function buildContentScript() {
  const result = await Bun.build({
    entrypoints: ["src/content/index.ts"],
    outdir: path.join(DIST_DIR, "content"),
    naming: "[name].js",
    minify: true,
  });

  if (!result.success) {
    console.error("Content script build failed:", result.logs);
    process.exit(1);
  }
}

async function buildBackground() {
  const result = await Bun.build({
    entrypoints: ["src/background/index.ts"],
    outdir: path.join(DIST_DIR, "background"),
    naming: "[name].js",
    minify: true,
  });

  if (!result.success) {
    console.error("Background script build failed:", result.logs);
    process.exit(1);
  }
}

async function buildPopup() {
  // Build JS
  const result = await Bun.build({
    entrypoints: ["src/popup/index.tsx"],
    outdir: path.join(DIST_DIR, "popup"),
    naming: "[name].js",
    minify: true,
  });

  if (!result.success) {
    console.error("Popup build failed:", result.logs);
    process.exit(1);
  }

  // Copy HTML
  await copyFile("src/popup/index.html", path.join(DIST_DIR, "popup", "index.html"));
}

async function buildCSS() {
  const proc = Bun.spawn(
    [
      "bunx",
      "tailwindcss",
      "-i",
      "src/popup/styles/index.css",
      "-o",
      path.join(DIST_DIR, "popup", "styles", "index.css"),
      "--minify",
    ],
    { stdout: "inherit", stderr: "inherit" }
  );

  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    console.error("CSS build failed");
    process.exit(1);
  }
}

async function copyPublicFiles() {
  // Copy manifest
  await copyFile("public/manifest.json", path.join(DIST_DIR, "manifest.json"));

  // Copy icons folder
  if (existsSync("public/icons")) {
    await cp("public/icons", path.join(DIST_DIR, "icons"), { recursive: true });
  }

  // Copy _locales for i18n
  if (existsSync("public/_locales")) {
    await cp("public/_locales", path.join(DIST_DIR, "_locales"), { recursive: true });
  }
}

async function build() {
  console.log("Building Threads Logger...");

  await clean();
  console.log("Cleaned dist directory");

  await Promise.all([buildContentScript(), buildPopup(), buildBackground()]);
  console.log("Built scripts");

  await buildCSS();
  console.log("Built CSS");

  await copyPublicFiles();
  console.log("Copied public files");

  console.log("Build complete! Load the extension from:", DIST_DIR);
}

build().catch((err) => {
  console.error("Build failed:", err);
  process.exit(1);
});
