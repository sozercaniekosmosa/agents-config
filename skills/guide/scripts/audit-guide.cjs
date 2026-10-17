/* global process, console, __dirname */
const fs = require("fs");
const path = require("path");

const PROJECT_ROOT = process.cwd();

function normalizePath(p) {
  return p.replace(/\\/g, "/").replace(/^\.\//, "");
}

const IGNORED_DIRS = new Set(["node_modules", ".git", "dist", ".archives", ".tmp", ".agents"]);

function findGuideFiles(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry.name)) {
      continue;
    }
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      findGuideFiles(fullPath, fileList);
    } else if (entry.isFile() && entry.name === "guide.md") {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

function collectCodeFiles(dir, baseDir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry.name)) {
      continue;
    }
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // If a subdirectory has its own guide.md and is not the baseDir, skip it (scoped to child guide)
      if (fullPath !== baseDir && fs.existsSync(path.join(fullPath, "guide.md"))) {
        continue;
      }
      collectCodeFiles(fullPath, baseDir, fileList);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name);
      if (['.ts', '.tsx', '.js', '.jsx'].includes(ext) && !entry.name.endsWith('.d.ts')) {
        const rel = normalizePath(path.relative(baseDir, fullPath));
        fileList.push(rel);
      }
    }
  }
  return fileList;
}

function auditGuide(guidePath, options = {}) {
  const normGuidePath = normalizePath(path.relative(PROJECT_ROOT, guidePath));
  console.log(`\n🔍 Auditing: ${normGuidePath}`);

  if (!fs.existsSync(guidePath)) {
    console.error(`  ❌ File not found: ${guidePath}`);
    return { success: false, errors: 1, warnings: 0 };
  }

  const moduleDir = path.dirname(guidePath);
  let content = fs.readFileSync(guidePath, "utf8");
  const lines = content.split(/\r?\n/);

  let errors = 0;
  let warnings = 0;

  // 1. Directives check
  if (!content.includes("CRITICAL AI DIRECTIVE") && !content.includes("КРИТИЧЕСКАЯ ДИРЕКТИВА")) {
    console.warn(`  ⚠️ Warning: CRITICAL AI DIRECTIVE block missing at top.`);
    warnings++;
  }

  // 2. Legacy XML tags check
  const xmlTagMatches = content.match(/<\/?(handoff_context|architecture_map|feature_status|plugin_capabilities_and_contracts)[^>]*>/gi);
  if (xmlTagMatches) {
    console.error(`  ❌ Error: Legacy XML tags detected (${xmlTagMatches.length} tags: ${xmlTagMatches.slice(0, 3).join(", ")}...)`);
    errors++;
  }

  // 3. Parse File Architecture Map
  let inMapSection = false;
  const listedFiles = [];
  const deadLinkLines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith("## File Architecture Map")) {
      inMapSection = true;
      continue;
    }
    if (inMapSection && trimmed.startsWith("## ")) {
      inMapSection = false;
      continue;
    }

    if (inMapSection && (trimmed.startsWith("- `") || trimmed.startsWith("- ["))) {
      let candidate = "";
      const backtickMatch = trimmed.match(/`([^`]+)`/);
      if (backtickMatch) {
        candidate = backtickMatch[1];
      } else {
        const linkMatch = trimmed.match(/\[([^\]]+)\]/);
        if (linkMatch) candidate = linkMatch[1];
      }

      const fileNames = candidate.split(/&|,/).map((s) => s.replace(/`/g, "").trim()).filter(Boolean);

      for (const fn of fileNames) {
        const cleanFn = fn.split("#")[0].trim();
        if (!cleanFn || cleanFn.includes(" ") || cleanFn.includes("*")) continue;

        const absFromModule = path.resolve(moduleDir, cleanFn);
        const absFromRoot = path.resolve(PROJECT_ROOT, cleanFn);

        const exists = fs.existsSync(absFromModule) || fs.existsSync(absFromRoot);
        listedFiles.push({ cleanFn, exists, lineIdx: i, fullLine: line });

        if (!exists) {
          console.error(`  ❌ Dead reference: "${cleanFn}" on line ${i + 1}`);
          errors++;
          deadLinkLines.push(i);
        }
      }
    }
  }

  // 4. Check for unlisted code files in module
  const codeFiles = collectCodeFiles(moduleDir, moduleDir);
  const unlistedFiles = [];

  for (const cf of codeFiles) {
    const isListed = listedFiles.some((item) => {
      return item.cleanFn === cf || item.cleanFn.endsWith(`/${cf}`) || cf.endsWith(`/${item.cleanFn}`);
    });
    if (!isListed) {
      unlistedFiles.push(cf);
    }
  }

  if (unlistedFiles.length > 0) {
    console.warn(`  ⚠️ Unlisted files (${unlistedFiles.length}):`);
    unlistedFiles.slice(0, 10).forEach((f) => console.warn(`     + ${f}`));
    if (unlistedFiles.length > 10) console.warn(`     ... and ${unlistedFiles.length - 10} more`);
    warnings++;
  }

  // 5. Auto-fix dead links if requested
  if (options.fix && deadLinkLines.length > 0) {
    const deadSet = new Set(deadLinkLines);
    const newLines = lines.filter((_, idx) => !deadSet.has(idx));
    fs.writeFileSync(guidePath, newLines.join("\n"), "utf8");
    console.log(`  🔧 Auto-fixed: removed ${deadLinkLines.length} dead lines from ${normGuidePath}`);
    errors -= deadLinkLines.length;
  }

  const success = errors === 0;
  console.log(`  Result: ${listedFiles.length} files tracked | ${deadLinkLines.length} dead | ${unlistedFiles.length} unlisted | ${warnings} warnings | ${errors} errors`);
  return { success, errors, warnings };
}

function main() {
  const args = process.argv.slice(2);
  const isAll = args.includes("--all");
  const isFix = args.includes("--fix");
  const positional = args.filter((a) => !a.startsWith("--"));

  let targetGuides = [];

  if (isAll) {
    targetGuides = findGuideFiles(PROJECT_ROOT);
  } else if (positional.length > 0) {
    let p = path.resolve(PROJECT_ROOT, positional[0]);
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) {
      p = path.join(p, "guide.md");
    }
    targetGuides = [p];
  } else {
    targetGuides = findGuideFiles(path.join(PROJECT_ROOT, "src"));
    const rootGuide = path.join(PROJECT_ROOT, "guide.md");
    if (fs.existsSync(rootGuide)) {
      targetGuides.unshift(rootGuide);
    }
  }

  if (targetGuides.length === 0) {
    console.log("No guide.md files found to audit.");
    process.exit(0);
  }

  let totalErrors = 0;
  let totalWarnings = 0;

  for (const guide of targetGuides) {
    const res = auditGuide(guide, { fix: isFix });
    totalErrors += res.errors;
    totalWarnings += res.warnings;
  }

  console.log(`\n================================`);
  console.log(`Audit Finished: ${targetGuides.length} guides checked | ${totalErrors} errors | ${totalWarnings} warnings`);
  console.log(`================================\n`);

  process.exit(totalErrors > 0 ? 1 : 0);
}

main();
