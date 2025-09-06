import { Resend } from "resend";

const ENV = process.env.NODE_ENV ?? "development";
const RESEND_KEY = process.env["RESEND_API_KEY"];
const DEFAULT_FROM = process.env["EMAIL_FROM"] || "QwikSale <noreply@qwiksale.sale>";

/** Light shape for attachments (file buffers/strings allowed by Resend). */
export type Attachment = {
  filename: string;
  content: string | Buffer; // base64 or utf8 is fine
  path?: string;            // if you prefer to let Resend fetch a URL
  contentType?: string;
};

/** Main options for sending email. `to` may be string or list. */
export type MailOptions = {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  from?: string;                // override default sender
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string | string[];
  tags?: { name: string; value: string }[];
  attachments?: Attachment[];
  /** When true, don’t hit the API — just log the payload (useful in dev/tests). */
  dryRun?: boolean;
};

/** Minimal HTML→text fallback (keeps it dependency-free). */
function htmlToText(html?: string): string | undefined {
  if (!html) return undefined;
  // Remove scripts/styles & decode a few entities; collapse whitespace
  const noScript = html.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, "");
  const stripped = noScript
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+\n/g, "\n")
    .trim();
  return stripped || undefined;
}

/** Create a client or a noop shim when key is absent (useful in dev). */
function makeClient() {
  if (!RESEND_KEY) {
    return null;
  }
  return new Resend(RESEND_KEY);
}

const client = makeClient();

/** Internal: small retry helper for transient errors (429/5xx). */
async function withRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  let attempt = 0;
  let lastErr: unknown;
  while (attempt < tries) {
    try {
      return await fn();
    } catch (err: any) {
      lastErr = err;
      const status = err?.statusCode ?? err?.status ?? err?.response?.status;
      const transient = status === 429 || (status >= 500 && status < 600);
      attempt++;
      if (!transient || attempt >= tries) break;
      const backoff = Math.min(2000 * attempt, 4000) + Math.random() * 200; // jitter
      await new Promise((r) => setTimeout(r, backoff));
    }
  }
  throw lastErr;
}

/**
 * Send an email via Resend.
 * - Falls back to console logging in dev when no API key is present (or dryRun=true).
 * - Will auto-generate a text body if only html is provided.
 */
export async function sendMail(
  to: string,
  subject: string,
  html: string
): Promise<{ id?: string; simulated?: boolean }>;

/** Overload with full options. */
export async function sendMail(options: MailOptions): Promise<{ id?: string; simulated?: boolean }>;

export async function sendMail(
  a: string | MailOptions,
  b?: string,
  c?: string
): Promise<{ id?: string; simulated?: boolean }> {
  // IMPORTANT: do not include html when it's undefined
  const opts: MailOptions =
    typeof a === "string"
      ? ({
          to: a,
          subject: b ?? "",
          ...(c !== undefined ? { html: c } : {}),
        } as MailOptions)
      : a;

  const payload = {
    from: opts.from || DEFAULT_FROM,
    to: Array.isArray(opts.to) ? opts.to : [opts.to],
    cc: opts.cc ? (Array.isArray(opts.cc) ? opts.cc : [opts.cc]) : undefined,
    bcc: opts.bcc ? (Array.isArray(opts.bcc) ? opts.bcc : [opts.bcc]) : undefined,
    reply_to: opts.replyTo
      ? (Array.isArray(opts.replyTo) ? opts.replyTo : [opts.replyTo])
      : undefined,
    subject: opts.subject,
    ...(opts.html !== undefined ? { html: opts.html } : {}),
    text: opts.text ?? htmlToText(opts.html),
    tags: opts.tags,
    attachments: opts.attachments as any, // Resend accepts { filename, content, ... }
  };

  // Dry run or missing key => log & pretend success in dev/test
  if (opts.dryRun || !client) {
    // eslint-disable-next-line no-console
    console.info(
      "[email:drawing-board]",
      JSON.stringify({ env: ENV, using: "noop", payload }, null, 2)
    );
    return { simulated: true };
  }

  const res = await withRetry(() => client.emails.send(payload as any));
  return { id: (res as any)?.id };
}

/* -----------------------------
   Convenience templaters
   ----------------------------- */

/** Quick minimal wrapper for simple branded emails. */
export function renderBasicTemplate(args: {
  title: string;
  body: string;
  cta?: { href: string; label: string };
  footer?: string;
}) {
  const { title, body, cta, footer } = args;
  return `<!doctype html>
<html>
  <head>
    <meta charSet="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${escapeHtml(title)}</title>
  </head>
  <body style="margin:0;background:#f6f8fa;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:24px;">
            <tr>
              <td>
                <h1 style="margin:0 0 8px 0;color:#111827;font-size:20px;">${escapeHtml(
                  title
                )}</h1>
                <p style="margin:0 0 16px 0;color:#374151;font-size:14px;line-height:1.5;">${body}</p>
                ${
                  cta
                    ? `<p style="margin:16px 0;">
                        <a href="${cta.href}" style="display:inline-block;background:#161748;color:#fff;text-decoration:none;padding:10px 16px;border-radius:10px;font-weight:600;">${escapeHtml(
                          cta.label
                        )}</a>
                      </p>`
                    : ""
                }
                ${
                  footer
                    ? `<p style="margin-top:24px;color:#6b7280;font-size:12px;">${footer}</p>`
                    : ""
                }
              </td>
            </tr>
          </table>
          <p style="color:#9ca3af;font-size:12px;margin-top:12px;">© ${new Date().getFullYear()} QwikSale</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function escapeHtml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
