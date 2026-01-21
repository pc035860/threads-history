#!/usr/bin/env bun
/**
 * Semantic Versioning Release Script for threads-logger
 *
 * Usage:
 *   bun run release [patch|minor|major] [--dry-run]
 *
 * Features:
 * - Auto-bump version in package.json and manifest.json
 * - Generate release note from git commits
 * - Create git commit and tag
 * - Support --dry-run for preview
 */

// =====================
// 型別定義
// =====================

type ReleaseType = "patch" | "minor" | "major";

interface ReleaseOptions {
  type: ReleaseType;
  dryRun: boolean;
}

interface CommitInfo {
  hash: string;
  message: string;
  type: string;
  scope?: string;
}

interface CommitCategory {
  features: string[];
  fixes: string[];
  changes: string[];
  docs: string[];
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

/**
 * 解析 Conventional Commit 格式
 * 格式: type(scope): description
 */
function parseCommitMessage(message: string): CommitInfo | null {
  // 移除合併 commit 的前綴
  const cleanMessage = message.replace(
    /^Merge (branch|remote-tracking branch|pull request) ['"]/i,
    ""
  );
  const conventionalRegex = /^(\w+)(?:\(([^)]+)\))?:?\s+(.+)$/;
  const match = cleanMessage.match(conventionalRegex);

  if (!match) return null;

  return {
    hash: "",
    message: match[3] ?? "",
    type: match[1] ?? "",
    scope: match[2],
  };
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
 * 取得最近的 tag
 */
async function getLastTag(): Promise<string> {
  const { stdout } = await execCommand(["git", "describe", "--tags", "--abbrev=0"], {
    silent: true,
  });
  return stdout.trim() || "";
}

/**
 * 取得自指定 tag 以來的 commits
 */
async function getCommitsSinceTag(tag: string): Promise<CommitInfo[]> {
  const range = tag ? `${tag}..HEAD` : "HEAD";
  const { stdout } = await execCommand(["git", "log", "--pretty=format:%H %s", range], {
    silent: true,
  });

  const lines = stdout.split("\n").filter(Boolean);

  return lines
    .map((line) => {
      const parts = line.split(" ");
      const hash = parts[0];
      const message = parts.slice(1).join(" ");
      const parsed = parseCommitMessage(message);
      return parsed ? { ...parsed, hash } : null;
    })
    .filter((c): c is CommitInfo => c !== null);
}

/**
 * 分類 commits
 */
function categorizeCommits(commits: CommitInfo[]): CommitCategory {
  const categories: CommitCategory = {
    features: [],
    fixes: [],
    changes: [],
    docs: [],
  };

  for (const commit of commits) {
    const item = commit.scope ? `- **${commit.scope}**: ${commit.message}` : `- ${commit.message}`;

    switch (commit.type) {
      case "feat":
        categories.features.push(item);
        break;
      case "fix":
        categories.fixes.push(item);
        break;
      case "refactor":
      case "perf":
      case "chore":
        categories.changes.push(item);
        break;
      case "docs":
        categories.docs.push(item);
        break;
      // 忽略 test, style, ci 等
    }
  }

  return categories;
}

/**
 * 產生 Release Note markdown
 */
function generateReleaseNote(version: string, categories: CommitCategory): string {
  const date = new Date().toLocaleDateString("zh-TW", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  let md = `# Release ${version}\n\n`;
  md += `**發布日期**: ${date}\n\n`;

  if (categories.features.length > 0) {
    md += `## ✨ 新功能\n\n${categories.features.join("\n")}\n\n`;
  }

  if (categories.fixes.length > 0) {
    md += `## 🐛 錯誤修復\n\n${categories.fixes.join("\n")}\n\n`;
  }

  if (categories.changes.length > 0) {
    md += `## 🔧 變更\n\n${categories.changes.join("\n")}\n\n`;
  }

  if (categories.docs.length > 0) {
    md += `## 📚 文件\n\n${categories.docs.join("\n")}\n\n`;
  }

  // 如果沒有內容，加入預設說明
  if (
    categories.features.length === 0 &&
    categories.fixes.length === 0 &&
    categories.changes.length === 0 &&
    categories.docs.length === 0
  ) {
    md += `## 📝 變更說明\n\n請參考 git log 取得完整變更記錄。\n\n`;
  }

  return md;
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

  // 5. 產生 release note
  const lastTag = await getLastTag();
  console.log(`Fetching commits since ${lastTag || "beginning"}...`);
  const commits = await getCommitsSinceTag(lastTag);
  console.log(`Found ${commits.length} commits\n`);

  const categories = categorizeCommits(commits);
  const releaseNote = generateReleaseNote(newVersion, categories);
  const releaseNotePath = `RELEASE_NOTE_v${newVersion}.md`;

  console.log("─".repeat(40));
  console.log(`Release Note (${releaseNotePath}):`);
  console.log("─".repeat(40));
  console.log(releaseNote);
  console.log("─".repeat(40) + "\n");

  if (dryRun) {
    console.log(`[DRY RUN] Would create ${releaseNotePath}\n`);
  } else {
    await Bun.write(releaseNotePath, releaseNote);
    console.log(`✓ Created ${releaseNotePath}\n`);
  }

  // 6. Git commit
  console.log("─".repeat(40));
  await createGitCommit(newVersion, dryRun);
  console.log("─".repeat(40) + "\n");

  // 7. Git tag
  console.log("─".repeat(40));
  await createGitTag(newVersion, dryRun);
  console.log("─".repeat(40) + "\n");

  // 8. 後續步驟提示
  if (!dryRun) {
    console.log(`\n✨ Release ${newVersion} created successfully!\n`);
    console.log("Next steps:");
    console.log(`  1. Review changes:   git show HEAD`);
    console.log(`  2. Push to remote:   git push origin main`);
    console.log(`                      git push origin v${newVersion}`);
    console.log(`  3. Build extension: bun run build`);
    console.log(`  4. Upload to Chrome Web Store: dist/ folder\n`);
  } else {
    console.log(`\n[DRY RUN] Complete. Run without --dry-run to apply changes.\n`);
  }
}

main().catch((err) => {
  console.error("Release failed:", err);
  process.exit(1);
});
