import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const APP_DIR = path.join(ROOT, "src", "app");

function walk(dir) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

function toPosix(p) {
  return p.split(path.sep).join("/");
}

// Convert a src/app/... file path to a route template.
// Handles groups (ignored) and dynamic segments ([id]).
function routeFromFile(file) {
  const rel = toPosix(path.relative(APP_DIR, file));

  // ignore api routes for link matching
  if (rel.startsWith("api/")) return null;

  if (!/(^|\/)(page|route)\.(ts|tsx|js|jsx)$/.test(rel)) return null;

  // only pages are navigable routes; keep route.ts out of matching unless you want /route endpoints too
  if (!rel.endsWith("/page.tsx") && !rel.endsWith("/page.ts") && !rel.endsWith("/page.jsx") && !rel.endsWith("/page.js")) {
    return null;
  }

  // drop the file name
  let segs = rel.replace(/\/page\.(ts|tsx|js|jsx)$/, "").split("/");

  // remove groups like (marketing)
  segs = segs.filter((s) => !(s.startsWith("(") && s.endsWith(")")));

  // ignore parallel segments like @slot
  segs = segs.filter((s) => !s.startsWith("@"));

  // turn into route template
  let route = "/" + segs.filter(Boolean).join("/");

  // root
  if (route === "/") return { template: "/", regex: /^\/$/ };

  // normalize
  route = route.replace(/\/+$/, "");

  // build regex for dynamic segments
  const reSrc = "^" + route
    .split("/")
    .map((s) => {
      if (!s) return "";
      if (s.startsWith("[") && s.endsWith("]")) return "[^/]+";
      if (s.startsWith("[...") && s.endsWith("]")) return ".+";
      return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("/") + "$";

  return { template: route, regex: new RegExp(reSrc) };
}

function isSkippableHref(href) {
  if (!href) return true;
  if (!href.startsWith("/")) return true;
  if (href.startsWith("//")) return true;
  if (href.startsWith("/api/")) return true;
  if (/\.(png|jpg|jpeg|webp|gif|svg|ico|css|js|map|txt|xml|json|pdf)$/i.test(href)) return true;
  return false;
}

function stripQueryHash(href) {
  return href.split("#")[0].split("?")[0].replace(/\/+$/, "") || "/";
}

const allFiles = walk(path.join(ROOT, "src"));
const routeFiles = walk(APP_DIR);

const routes = routeFiles
  .map(routeFromFile)
  .filter(Boolean);

const SRC_TEXT_FILES = allFiles.filter((f) => /\.(ts|tsx|js|jsx|mdx)$/.test(f));

const hrefs = new Map(); // href -> set(files)
const HREF_RE = /href\s*=\s*["'](\/[^"' \n\r\t>]+)["']/g;

for (const file of SRC_TEXT_FILES) {
  const txt = fs.readFileSync(file, "utf8");
  let m;
  while ((m = HREF_RE.exec(txt))) {
    const href = String(m[1] || "");
    if (isSkippableHref(href)) continue;
    const clean = stripQueryHash(href);
    if (!hrefs.has(clean)) hrefs.set(clean, new Set());
    hrefs.get(clean).add(toPosix(path.relative(ROOT, file)));
  }
}

const missing = [];

for (const [href, files] of hrefs.entries()) {
  const ok = routes.some((r) => r.regex.test(href));
  if (!ok) {
    missing.push({ href, files: Array.from(files) });
  }
}

missing.sort((a, b) => a.href.localeCompare(b.href));

if (!missing.length) {
  console.log("✅ No missing static href routes found.");
  process.exit(0);
}

console.log(`❌ Missing routes for ${missing.length} static hrefs:\n`);
for (const item of missing) {
  console.log(item.href);
  for (const f of item.files) console.log("  - " + f);
  console.log("");
}

process.exit(1);
