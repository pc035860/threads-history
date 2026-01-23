#!/usr/bin/env bun
/**
 * Semantic Versioning Release Script for threads-logger
 *
 * Usage:
 *   bun run release [patch|minor|major] [--dry-run]
 *
 * Features:
 * - Auto-bump version in package.json and manifest.json
 * - Create git commit and tag
 * - Build and pack extension to packing/
 * - Support --dry-run for preview
 */

import { mkdir } from "fs/promises";
import path from "path";

// =====================
// 型別定義
// =====================

type ReleaseType = "patch" | "minor" | "major";

interface ReleaseOptions {
  type: ReleaseType;
  dryRun: boolean;
}

// =====================
// 工具函式
// =====================

/**
 * 執行 shell 指令並回傳輸出
 */
async function execCommand(
  args: string[],
  options: { silent?: boolean; input?: string } = {}
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn(args, {
    stdout: options.silent ? "pipe" : "inherit",
    stderr: options.silent ? "pipe" : "inherit",
  });

  const stdout = options.silent ? await new Response(proc.stdout).text() : "";
  const stderr = options.silent ? await new Response(proc.stderr).text() : "";
  const exitCode = await proc.exited;

  return { stdout, stderr, exitCode };
}

// =====================
// 版本號操作
// =====================

/**
 * 計算新版本號
 */
function bumpVersion(current: string, type: ReleaseType): string {
  const parts = current.split(".").map(Number);
  const major = parts[0] ?? 0;
  const minor = parts[1] ?? 0;
  const patch = parts[2] ?? 0;

  switch (type) {
    case "major":
      return `${major + 1}.0.0`;
    case "minor":
      return `${major}.${minor + 1}.0`;
    case "patch":
      return `${major}.${minor}.${patch + 1}`;
    default:
      throw new Error(`Invalid release type: ${type}`);
  }
}

// =====================
// 檔案操作
// =====================

/**
 * 更新版本檔案 (package.json 和 manifest.json)
 */
async function updateVersionFiles(newVersion: string, dryRun: boolean): Promise<void> {
  const files = ["package.json", "public/manifest.json"];

  for (const file of files) {
    const content = await Bun.file(file).text();
    const currentVersion = content.match(/"version":\s*"(\d+\.\d+\.\d+)"/)?.[1];
    const updated = content.replace(/"version":\s*"\d+\.\d+\.\d+"/, `"version": "${newVersion}"`);

    if (dryRun) {
      console.log(`[DRY RUN] Would update ${file}`);
      console.log(`  Old version: ${currentVersion}`);
      console.log(`  New version: ${newVersion}`);
    } else {
      await Bun.write(file, updated);
      console.log(`✓ Updated ${file} -> ${newVersion}`);
    }
  }
}

// =====================
// Git 操作
// =====================

/**
 * 檢查工作目錄是否乾淨
 */
async function isWorkingDirectoryClean(): Promise<boolean> {
  const { stdout } = await execCommand(["git", "status", "--porcelain"], { silent: true });
  return stdout.trim() === "";
}

/**
 * 建立 git commit
 */
async function createGitCommit(version: string, dryRun: boolean): Promise<void> {
  const message = `chore(release): bump version to ${version}`;

  if (dryRun) {
    console.log(`[DRY RUN] Would commit: ${message}`);
    return;
  }

  // 加入檔案到 staging
  await execCommand(["git", "add", "package.json", "public/manifest.json"]);

  // 執行 commit
  const proc = Bun.spawn(["git", "commit", "-m", message], {
    stdout: "inherit",
    stderr: "inherit",
  });
  await proc.exited;

  console.log(`✓ Created commit: ${message}`);
}

/**
 * 建立 git tag
 */
async function createGitTag(version: string, dryRun: boolean): Promise<void> {
  const tagName = `v${version}`;

  if (dryRun) {
    console.log(`[DRY RUN] Would create tag: ${tagName}`);
    return;
  }

  const proc = Bun.spawn(["git", "tag", "-a", tagName, "-m", `Release ${version}`], {
    stdout: "inherit",
    stderr: "inherit",
  });
  await proc.exited;

  console.log(`✓ Created tag: ${tagName}`);
}

/**
 * 打包擴展到 packing/ 目錄
 */
async function packExtension(version: string, dryRun: boolean): Promise<void> {
  const PACKING_DIR = "packing";
  const zipFileName = `chrome-v${version}.zip`;
  const zipPath = path.join(PACKING_DIR, zipFileName);

  if (dryRun) {
    console.log(`[DRY RUN] Would create ${zipPath}`);
    return;
  }

  // 1. 建立 dist
  console.log("Building extension...");
  const buildProc = Bun.spawn(["bun", "run", "build.ts"], {
    stdout: "inherit",
    stderr: "inherit",
  });
  const buildExitCode = await buildProc.exited;
  if (buildExitCode !== 0) {
    throw new Error("Build failed");
  }
  console.log("✓ Build complete");

  // 2. 建立 packing 目錄
  await mkdir(PACKING_DIR, { recursive: true });

  // 3. 壓縮 dist/ 到 zip
  console.log(`Creating ${zipFileName}...`);
  const zipProc = Bun.spawn(["zip", "-r", zipPath, "dist/"], {
    stdout: "inherit",
    stderr: "inherit",
    cwd: ".",
  });
  const zipExitCode = await zipProc.exited;
  if (zipExitCode !== 0) {
    throw new Error("Zip creation failed");
  }

  console.log(`✓ Created ${zipPath}`);
}

// =====================
// 主流程
// =====================

async function main() {
  const args = process.argv.slice(2);
  const typeArg = args[0];
  const dryRun = args.includes("--dry-run");

  // 驗證輸入
  const validTypes: ReleaseType[] = ["patch", "minor", "major"];
  if (!validTypes.includes(typeArg as ReleaseType)) {
    console.error("Usage: bun run release [patch|minor|major] [--dry-run]");
    console.error("");
    console.error("Examples:");
    console.error("  bun run release:patch    # 1.0.0 -> 1.0.1 (bug fixes)");
    console.error("  bun run release:minor   # 1.0.0 -> 1.1.0 (new features)");
    console.error("  bun run release:major   # 1.0.0 -> 2.0.0 (breaking changes)");
    console.error("  bun run release -- --dry-run  # Preview without applying");
    process.exit(1);
  }

  const type = typeArg as ReleaseType;

  console.log(`\n🚀 Starting ${type} release${dryRun ? " (DRY RUN)" : ""}...\n`);

  // 1. 檢查工作目錄是否乾淨
  if (!dryRun) {
    const isClean = await isWorkingDirectoryClean();
    if (!isClean) {
      console.error("❌ Working directory is not clean.");
      console.error("   Please commit or stash changes first.\n");
      console.error("   Run 'git status' to see what's changed.");
      process.exit(1);
    }
  }

  // 2. 讀取當前版本
  const pkgContent = await Bun.file("package.json").text();
  const pkg = JSON.parse(pkgContent);
  const currentVersion = pkg.version as string;
  console.log(`Current version: ${currentVersion}`);

  // 3. 計算新版本
  const newVersion = bumpVersion(currentVersion, type);
  console.log(`New version: ${newVersion}\n`);

  // 4. 更新版本檔案
  console.log("─".repeat(40));
  await updateVersionFiles(newVersion, dryRun);
  console.log("─".repeat(40) + "\n");

  // 5. Git commit
  console.log("─".repeat(40));
  await createGitCommit(newVersion, dryRun);
  console.log("─".repeat(40) + "\n");

  // 6. Git tag
  console.log("─".repeat(40));
  await createGitTag(newVersion, dryRun);
  console.log("─".repeat(40) + "\n");

  // 7. 打包擴展
  console.log("─".repeat(40));
  await packExtension(newVersion, dryRun);
  console.log("─".repeat(40) + "\n");

  // 8. 後續步驟提示
  if (!dryRun) {
    console.log(`\n✨ Release ${newVersion} created successfully!\n`);
    console.log("Next steps:");
    console.log(`  1. Review changes:   git show HEAD`);
    console.log(`  2. Push to remote:   git push origin main`);
    console.log(`                      git push origin v${newVersion}`);
    console.log(`  3. Upload to Chrome Web Store: packing/chrome-v${newVersion}.zip\n`);
  } else {
    console.log(`\n[DRY RUN] Complete. Run without --dry-run to apply changes.\n`);
  }
}

main().catch((err) => {
  console.error("Release failed:", err);
  process.exit(1);
});
