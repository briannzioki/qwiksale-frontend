// next.config.js
const { withSentryConfig } = require("@sentry/nextjs");

/**
 * Build a tunnel rewrite from /monitoring to the correct Sentry ingest endpoint
 * by parsing SENTRY_DSN (or NEXT_PUBLIC_SENTRY_DSN).
 * DSN: https://<key>@o<orgId>.ingest.sentry.io/<projectId>
 */
function getSentryTunnelRewrite() {
  const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN || "";
  const m = dsn.match(/^https?:\/\/[^@]+@([^/]+)\/(\d+)$/i);
  if (!m) return null;
  const host = m[1];      // e.g. o123456.ingest.sentry.io
  const projectId = m[2]; // e.g. 4509963654922320
  return {
    source: "/monitoring",
    destination: `https://${host}/api/${projectId}/envelope/`,
  };
}

const nextConfig = {
  async rewrites() {
    const rules = [];
    const tunnel = getSentryTunnelRewrite();
    if (tunnel) rules.push(tunnel);
    return rules;
  },
  // add your other Next.js config (images, headers, etc.) here
};

module.exports = withSentryConfig(
  nextConfig,
  {
    // Sentry build-time options (sourcemaps upload uses SENTRY_AUTH_TOKEN from env)
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,
    silent: true,
  }
);
