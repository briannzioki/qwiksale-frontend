#!/usr/bin/env node
/* Media cap guard: only flags media-related 10s. */
const fs = require("fs");
const path = require("path");

const root = path.resolve(process.cwd(), "src");
const mediaHintRe = /(GalleryUploader|EditMediaClient|MediaManager|SellServiceClient|ProductForm|ServiceForm)/;
const issues = [];

function isMediaFile(p, content) {
  if (/[/\\](components|app)[/\\].*(sell|edit)/i.test(p)) return true;
  if (mediaHintRe.test(content)) return true;
  return false;
}

function scanFile(p) {
  const content = fs.readFileSync(p, "utf8");
  if (!isMediaFile(p, content)) return; // only media-y files

  const lines = content.split(/\r?\n/);

  lines.forEach((line, i) => {
    // max={10} on media components
    if (/\bmax\s*=\s*\{\s*10\s*\}/.test(line) && mediaHintRe.test(line)) {
      issues.push({ file: p, line: i + 1, msg: "Replace max={10} with max={6} (media cap)" });
    }
    // obvious media file caps
    if (/const\s+MAX_FILES\s*=\s*10\b/.test(line)) {
      issues.push({ file: p, line: i + 1, msg: "Set MAX_FILES = 6 (media cap)" });
    }
    // common pendingFiles / mergedGallery hard-caps
    if (/\.slice\(\s*0\s*,\s*10\s*\)/.test(line) && /(pendingFiles|mergedGallery|gallery)/.test(content)) {
      issues.push({ file: p, line: i + 1, msg: "Use slice(0, 6) for media cap" });
    }
  });

  // target wrappers must default to 6
  if (p.endsWith(path.join("product", "[id]", "edit", "ProductMediaManager.tsx"))) {
    if (!/max\s*=\s*6\b/.test(content)) {
      issues.push({ file: p, line: 0, msg: "ProductMediaManager default param should be max = 6" });
    }
  }
  if (p.endsWith(path.join("service", "[id]", "edit", "ServiceMediaManager.tsx"))) {
    if (!/max\s*=\s*6\b/.test(content)) {
      issues.push({ file: p, line: 0, msg: "ServiceMediaManager default param should be max = 6" });
    }
  }

  // service edit page: no max override + hideMedia present
  if (p.endsWith(path.join("service", "[id]", "edit", "page.tsx"))) {
    if (/<ServiceMediaManager[^>]*\bmax=/.test(content)) {
      issues.push({ file: p, line: 0, msg: "Do not pass max= at service edit call-site; let default 6 apply" });
    }
    if (!/<SellServiceClient[^>]*\beditId=/.test(content)) {
      issues.push({ file: p, line: 0, msg: "<SellServiceClient> should use editId={service.id}" });
    }
    if (!/<SellServiceClient[^>]*\bhideMedia\b/.test(content)) {
      issues.push({ file: p, line: 0, msg: "<SellServiceClient> should include hideMedia prop" });
    }
  }

  // product edit page: no max override at call-site
  if (p.endsWith(path.join("product", "[id]", "edit", "page.tsx"))) {
    const m = content.match(/<ProductMediaManager([\s\S]*?)\/>/);
    if (m && /max\s*=/.test(m[1] || "")) {
      issues.push({ file: p, line: 0, msg: "Do not pass max= at product edit call-site; let default 6 apply" });
    }
  }
}

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) scanFile(p);
  }
}

if (fs.existsSync(root)) walk(root);

if (issues.length) {
  console.error("\n❌ Media cap check failed:\n");
  for (const it of issues) {
    const rel = path.relative(process.cwd(), it.file);
    console.error(`- ${rel}${it.line ? ":" + it.line : ""} — ${it.msg}`);
  }
  process.exit(1);
}
console.log("✅ Media cap checks passed.");
