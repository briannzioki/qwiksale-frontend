/* scripts/repo-audit.mjs
   Generates .audit/report.md by scanning repo + optional Playwright JSON report.
   Safe output: secrets are never printed, only presence and non-sensitive fields like URLs.
*/

import fs from "node:fs";
import path from "node:path";

const argv = process.argv.slice(2);
function argValue(flag, fallback = null) {
  const i = argv.indexOf(flag);
  if (i >= 0 && i + 1 < argv.length) return argv[i + 1];
  return fallback;
}

const ROOT = path.resolve(argValue("--root", process.cwd()));
const OUT_DIR = path.resolve(ROOT, argValue("--out", ".audit"));
const PW_JSON = argValue("--pw", null) ? path.resolve(ROOT, argValue("--pw")) : null;

const TEXT_EXTS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".mjs",
  ".cjs",
  ".json",
  ".md",
  ".yml",
  ".yaml",
  ".css",
  ".prisma",
  ".env",
  ".local",
]);

const IGNORE_DIRS = new Set([
  "node_modules",
  ".next",
  ".git",
  "dist",
  "build",
  ".turbo",
  ".cache",
  "coverage",
  "tests\\e2e\\.artifacts",
  "tests/e2e/.artifacts",
  "tests\\e2e\\playwright-report",
  "tests/e2e/playwright-report",
]);

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function isIgnoredDir(absPath) {
  const rel = path.relative(ROOT, absPath);
  if (!rel) return false;
  const parts = rel.split(path.sep);
  for (const part of parts) {
    if (IGNORE_DIRS.has(part)) return true;
  }
  return false;
}

function safeRead(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}

function listFiles(dirAbs, out = []) {
  if (isIgnoredDir(dirAbs)) return out;
  let entries = [];
  try {
    entries = fs.readdirSync(dirAbs, { withFileTypes: true });
  } catch {
    return out;
  }

  for (const e of entries) {
    const abs = path.join(dirAbs, e.name);
    if (e.isDirectory()) {
      if (!isIgnoredDir(abs)) listFiles(abs, out);
      continue;
    }
    const ext = path.extname(e.name);
    const looksEnv = e.name.startsWith(".env");
    if (TEXT_EXTS.has(ext) || looksEnv) out.push(abs);
  }
  return out;
}

function redactEnvLine(line) {
  const idx = line.indexOf("=");
  if (idx < 0) return line;
  const k = line.slice(0, idx).trim();
  const v = line.slice(idx + 1).trim();

  const secretish = /secret|token|password|key/i.test(k);
  if (secretish) return `${k}=[set]`;

  if (/url/i.test(k)) return `${k}=${v}`;

  if (v.length > 0) return `${k}=[set]`;
  return `${k}=[missing]`;
}

function readEnvFile(fileAbs) {
  const raw = safeRead(fileAbs);
  if (!raw) return null;

  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));

  const picks = [];
  for (const l of lines) {
    if (
      /^NEXTAUTH_/i.test(l) ||
      /^AUTH_/i.test(l) ||
      /^PLAYWRIGHT_/i.test(l) ||
      /^E2E_/i.test(l)
    ) {
      picks.push(redactEnvLine(l));
    }
  }
  return picks;
}

function fileExists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

function relPath(abs) {
  return path.relative(ROOT, abs).split(path.sep).join("/");
}

function collectMatches(files, rules) {
  const hitsByRule = new Map();
  for (const r of rules) hitsByRule.set(r.id, []);

  for (const f of files) {
    const content = safeRead(f);
    if (!content) continue;

    for (const rule of rules) {
      if (!rule.re.test(content)) continue;

      const lines = content.split(/\r?\n/);
      const hits = [];
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (rule.lineRe && !rule.lineRe.test(line)) continue;
        if (!rule.lineRe && !rule.re.test(line)) continue;
        hits.push({ line: i + 1, text: line.slice(0, 220) });
        if (hits.length >= (rule.maxLines ?? 12)) break;
      }

      hitsByRule.get(rule.id).push({
        file: relPath(f),
        sample: hits,
      });
    }
  }

  return hitsByRule;
}

function loadPkg() {
  const p = path.join(ROOT, "package.json");
  const raw = safeRead(p);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function parseVersion(v) {
  if (!v || typeof v !== "string") return null;
  const m = v.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}

function pickDepVersion(pkg, name) {
  const all = {
    ...(pkg?.dependencies || {}),
    ...(pkg?.devDependencies || {}),
    ...(pkg?.peerDependencies || {}),
  };
  return all[name] || null;
}

function walkPlaywrightFailures(node, out = []) {
  if (!node) return out;

  if (Array.isArray(node.tests)) {
    for (const t of node.tests) {
      if (!Array.isArray(t.results)) continue;
      for (const r of t.results) {
        if (r.status === "failed") {
          out.push({
            title: (t.titlePath || []).join(" > ") || t.title || "unknown",
            location: t.location ? `${t.location.file}:${t.location.line}:${t.location.column}` : null,
            error: r.error?.message || r.error?.stack || "unknown error",
          });
        }
      }
    }
  }

  if (Array.isArray(node.suites)) {
    for (const s of node.suites) walkPlaywrightFailures(s, out);
  }
  return out;
}

function writeReport(md) {
  ensureDir(OUT_DIR);
  fs.writeFileSync(path.join(OUT_DIR, "report.md"), md, "utf8");
}

function toMdList(items) {
  if (!items.length) return "None found.\n";
  return items.map((x) => `- ${x}`).join("\n") + "\n";
}

function mdCodeBlock(lang, text) {
  return "```" + lang + "\n" + text + "\n```\n";
}

function analyzeSignals(hits, pkgInfo, envSignals) {
  const nextAuthV = pkgInfo?.nextAuthVersion || null;
  const nextAuthParsed = parseVersion(
    typeof nextAuthV === "string" ? nextAuthV.replace(/^[^\d]*/, "") : ""
  );

  const hasAuthTs = fileExists("src/auth.ts");
  const hasAuthConfig = fileExists("src/auth.config.ts");
  const hasNextAuthRoute =
    fileExists("src/app/api/auth/[...nextauth]/route.ts") ||
    fileExists("src/app/api/auth/[...nextauth]/route.js") ||
    fileExists("src/pages/api/auth/[...nextauth].ts");

  const middlewareGetToken = (hits.get("middleware_getToken") || []).length > 0;
  const middlewareAuthWrapper = (hits.get("middleware_auth_wrapper") || []).length > 0;

  const signinRedirectFalse = (hits.get("signin_redirect_false") || []).length > 0;

  const credsProviderFound = (hits.get("auth_credentials_provider") || []).length > 0;
  const credsAuthorizeFound = (hits.get("auth_authorize") || []).length > 0;

  const envNextauthUrl = envSignals.urls.NEXTAUTH_URL || null;
  const envAuthUrl = envSignals.urls.AUTH_URL || null;

  const url = envAuthUrl || envNextauthUrl || "";
  const urlLooksHttps = /^https:\/\//i.test(url);
  const urlLooksLocalhost = /localhost|127\.0\.0\.1/i.test(url);

  const risks = [];

  if (signinRedirectFalse) {
    risks.push(
      "Sign-in code uses redirect:false. If it does not manually navigate on success, Playwright will stay on /signin and your exact failures happen."
    );
  }

  if (nextAuthParsed && nextAuthParsed.major >= 5 && middlewareGetToken) {
    risks.push(
      "NextAuth v5 detected and middleware uses getToken(). This commonly breaks session detection because cookie names/logic differ. Prefer auth() wrapper in middleware for v5."
    );
  }

  if (url && urlLooksHttps && urlLooksLocalhost) {
    risks.push(
      "NEXTAUTH_URL or AUTH_URL is https on localhost. That can cause secure cookies to be dropped on http://localhost, leading to immediate re-bounce to /signin."
    );
  }

  if (!hasNextAuthRoute) {
    risks.push("NextAuth route handler not found at common paths. If handlers are not mounted, sign-in can look like it runs but never sets a usable cookie.");
  }

  if (!credsProviderFound || !credsAuthorizeFound) {
    risks.push(
      "Credentials provider or authorize() not found by scan. If credentials auth is miswired or returns null, /signin will not exit after submit."
    );
  }

  if (middlewareGetToken && !middlewareAuthWrapper) {
    risks.push(
      "Middleware uses token decode flow. If the secret differs from the server auth secret, middleware will treat users as logged out and bounce to /signin."
    );
  }

  if (!hasAuthTs && !hasAuthConfig) {
    risks.push("src/auth.ts and src/auth.config.ts not found. If you are on v4 patterns, make sure middleware and auth routes match v4 patterns consistently.");
  }

  return {
    nextAuthV,
    nextAuthParsed,
    hasAuthTs,
    hasAuthConfig,
    hasNextAuthRoute,
    middlewareGetToken,
    middlewareAuthWrapper,
    signinRedirectFalse,
    credsProviderFound,
    credsAuthorizeFound,
    url,
    risks,
  };
}

function collectEnvSignals() {
  const out = {
    files: [],
    urls: {},
    flags: {},
    present: {},
  };

  const envFiles = [".env.local", ".env.e2e.local", ".env"];
  for (const f of envFiles) {
    const abs = path.join(ROOT, f);
    if (!fs.existsSync(abs)) continue;
    const lines = readEnvFile(abs) || [];
    out.files.push({ file: f, lines });

    for (const line of lines) {
      const idx = line.indexOf("=");
      if (idx < 0) continue;
      const k = line.slice(0, idx);
      const v = line.slice(idx + 1);

      if (/^(NEXTAUTH_URL|AUTH_URL)$/i.test(k)) out.urls[k] = v;
      if (/^(NEXTAUTH_SECRET|AUTH_SECRET)$/i.test(k)) out.present[k] = v === "[set]" ? "set" : "missing";
      if (/^(NEXTAUTH_TRUST_HOST|AUTH_TRUST_HOST)$/i.test(k)) out.flags[k] = v;
    }
  }

  return out;
}

function main() {
  ensureDir(OUT_DIR);

  const pkg = loadPkg();
  const nextVer = pickDepVersion(pkg, "next");
  const nextAuthVer = pickDepVersion(pkg, "next-auth") || pickDepVersion(pkg, "@auth/core");

  const files = listFiles(ROOT);

  const rules = [
    { id: "signin_redirect_false", re: /redirect\s*:\s*false/g, lineRe: /redirect\s*:\s*false/ },
    { id: "signin_signin_call", re: /\bsignIn\s*\(/g, lineRe: /\bsignIn\s*\(/ },
    { id: "signin_callbackurl", re: /callbackUrl/g, lineRe: /callbackUrl/ },

    { id: "auth_credentials_provider", re: /Credentials\s*\(/g, lineRe: /Credentials\s*\(/ },
    { id: "auth_authorize", re: /\bauthorize\s*\(/g, lineRe: /\bauthorize\s*\(/ },
    { id: "auth_session_strategy", re: /session\s*:\s*\{[^}]*strategy/g, lineRe: /strategy/ },

    { id: "middleware_getToken", re: /\bgetToken\s*\(/g, lineRe: /\bgetToken\s*\(/ },
    { id: "middleware_auth_wrapper", re: /\bauth\s*\(\s*\(/g, lineRe: /\bauth\s*\(\s*\(/ },

    { id: "env_secret_refs", re: /\b(NEXTAUTH_SECRET|AUTH_SECRET|NEXTAUTH_URL|AUTH_URL)\b/g, lineRe: /\b(NEXTAUTH_SECRET|AUTH_SECRET|NEXTAUTH_URL|AUTH_URL)\b/ },

    { id: "header_dashboard_label", re: /Dashboard/i, lineRe: /Dashboard/i, maxLines: 20 },
    { id: "header_delivery_label", re: /Delivery/i, lineRe: /Delivery/i, maxLines: 20 },
    { id: "requests_route_refs", re: /\/requests\b|requests\/\[/g, lineRe: /\/requests\b|requests\/\[/, maxLines: 20 },
    { id: "carrier_route_refs", re: /\/carrier\b|carrier\/\[/g, lineRe: /\/carrier\b|carrier\/\[/, maxLines: 20 },
  ];

  const hits = collectMatches(files, rules);
  const envSignals = collectEnvSignals();

  let pwFailures = [];
  if (PW_JSON && fs.existsSync(PW_JSON)) {
    const raw = safeRead(PW_JSON);
    try {
      const json = JSON.parse(raw);
      pwFailures = walkPlaywrightFailures(json, []);
    } catch {
      pwFailures = [];
    }
  }

  const pkgInfo = {
    nextVersion: nextVer,
    nextAuthVersion: nextAuthVer,
  };

  const signals = analyzeSignals(hits, pkgInfo, envSignals);

  const importantFiles = [
    "src/middleware.ts",
    "src/auth.ts",
    "src/auth.config.ts",
    "src/app/api/auth/[...nextauth]/route.ts",
    "src/app/signin/page.tsx",
    "src/app/signin/_components/CredentialsForm.client.tsx",
  ];

  const existingImportant = importantFiles.filter((p) => fileExists(p));

  const md = [
    "# QwikSale E2E Audit Report",
    "",
    `Root: ${ROOT}`,
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Package signals",
    "",
    `- next: ${pkgInfo.nextVersion || "unknown"}`,
    `- next-auth/@auth/core: ${pkgInfo.nextAuthVersion || "unknown"}`,
    "",
    "## Failing tests from Playwright JSON (if provided)",
    "",
    pwFailures.length
      ? pwFailures
          .slice(0, 50)
          .map((f) => {
            const loc = f.location ? ` (${f.location})` : "";
            return `- ${f.title}${loc}\n  - ${String(f.error || "").split("\n")[0].slice(0, 220)}`;
          })
          .join("\n")
      : "None parsed (either JSON not provided or parse failed).",
    "",
    "## High probability causes for your exact failures",
    "",
    signals.risks.length ? toMdList(signals.risks) : "No high-probability signals detected by scan.\n",
    "",
    "## Auth wiring snapshot",
    "",
    `- auth.ts present: ${signals.hasAuthTs}`,
    `- auth.config.ts present: ${signals.hasAuthConfig}`,
    `- NextAuth route present: ${signals.hasNextAuthRoute}`,
    `- middleware uses getToken(): ${signals.middlewareGetToken}`,
    `- middleware uses auth() wrapper: ${signals.middlewareAuthWrapper}`,
    `- sign-in code contains redirect:false: ${signals.signinRedirectFalse}`,
    `- Credentials provider found: ${signals.credsProviderFound}`,
    `- authorize() found: ${signals.credsAuthorizeFound}`,
    `- AUTH_URL/NEXTAUTH_URL (redacted safe): ${signals.url || "not detected"}`,
    "",
    "## Env file summary (safe)",
    "",
    envSignals.files.length
      ? envSignals.files
          .map((x) => {
            const lines = x.lines.length ? x.lines.map((l) => `- ${l}`).join("\n") : "- (no relevant keys found)";
            return `### ${x.file}\n${lines}`;
          })
          .join("\n\n")
      : "No env files found or no relevant keys detected.",
    "",
    "## Locations to inspect next (existing files)",
    "",
    existingImportant.length ? toMdList(existingImportant) : "None of the common auth/signin files were found at expected paths.\n",
    "",
    "## Repo matches by topic",
    "",
    "### Sign-in and callbackUrl usage",
    "",
    mdCodeBlock(
      "txt",
      JSON.stringify(
        {
          signin_redirect_false: hits.get("signin_redirect_false") || [],
          signin_signin_call: hits.get("signin_signin_call") || [],
          signin_callbackurl: hits.get("signin_callbackurl") || [],
        },
        null,
        2
      )
    ),
    "",
    "### Middleware auth detection",
    "",
    mdCodeBlock(
      "txt",
      JSON.stringify(
        {
          middleware_getToken: hits.get("middleware_getToken") || [],
          middleware_auth_wrapper: hits.get("middleware_auth_wrapper") || [],
        },
        null,
        2
      )
    ),
    "",
    "### Credentials provider and authorize()",
    "",
    mdCodeBlock(
      "txt",
      JSON.stringify(
        {
          auth_credentials_provider: hits.get("auth_credentials_provider") || [],
          auth_authorize: hits.get("auth_authorize") || [],
          auth_session_strategy: hits.get("auth_session_strategy") || [],
        },
        null,
        2
      )
    ),
    "",
    "### Header menu labels (Dashboard, Delivery)",
    "",
    mdCodeBlock(
      "txt",
      JSON.stringify(
        {
          header_dashboard_label: hits.get("header_dashboard_label") || [],
          header_delivery_label: hits.get("header_delivery_label") || [],
        },
        null,
        2
      )
    ),
    "",
    "### Route references (requests, carrier)",
    "",
    mdCodeBlock(
      "txt",
      JSON.stringify(
        {
          requests_route_refs: hits.get("requests_route_refs") || [],
          carrier_route_refs: hits.get("carrier_route_refs") || [],
        },
        null,
        2
      )
    ),
    "",
    "## What this report is designed to catch (mapped to your failing specs)",
    "",
    "- Staying on /signin after submit: redirect:false without navigation, authorize() returns null, or cookie dropped due to https URL on localhost.",
    "- Redirect loop back to /signin after a short navigation: middleware cannot read the session token (secret mismatch or wrong middleware strategy).",
    "- Dashboard menu entry not found: header menu item lacks accessible name containing 'Dashboard' or only renders for some roles.",
    "- Delivery and Requests signed-in navigation bounces to /signin: route gate still thinks user is anonymous due to middleware/session mismatch.",
    "",
    "## Next step after you generate this report",
    "",
    "Open .audit/report.md and it will list the exact files and line samples where the mismatches are. Fix the highest-probability item first (usually redirect:false or middleware getToken vs auth() mismatch), then rerun only the failing specs.",
    "",
  ].join("\n");

  writeReport(md);

  const summary = {
    root: ROOT,
    outDir: relPath(OUT_DIR),
    pkg: pkgInfo,
    signals,
    pwFailureCount: pwFailures.length,
  };
  fs.writeFileSync(path.join(OUT_DIR, "summary.json"), JSON.stringify(summary, null, 2), "utf8");
  fs.writeFileSync(path.join(OUT_DIR, "pw-failures.json"), JSON.stringify(pwFailures, null, 2), "utf8");

  process.stdout.write(
    [
      "Audit complete.",
      `Report: ${path.join(OUT_DIR, "report.md")}`,
      `Summary: ${path.join(OUT_DIR, "summary.json")}`,
      `Playwright failures: ${path.join(OUT_DIR, "pw-failures.json")}`,
    ].join("\n") + "\n"
  );
}

main();
