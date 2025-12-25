"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";

type TicketType = "CONTACT" | "BUG" | "OTHER";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_SUBJECT = 120;
const MAX_MESSAGE = 2000;
const MIN_MESSAGE = 10;
const MIN_SECONDS_BEFORE_SUBMIT = 3; // simple anti-bot
const LS_KEY = "contactDraft.v1";

type Draft = {
  name: string;
  email: string;
  subject: string;
  message: string;
  type: TicketType;
};

export default function ContactPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [type, setType] = useState<TicketType>("CONTACT");
  const [hpt, setHpt] = useState(""); // honeypot
  const [submitting, setSubmitting] = useState(false);
  const [sentOnce, setSentOnce] = useState(false);

  const mountedAtRef = useRef<number>(Date.now());
  const abortRef = useRef<AbortController | null>(null);

  // ---------- derive validation ----------
  const trimmedEmail = email.trim();
  const emailErr =
    trimmedEmail.length === 0
      ? "Email is required."
      : EMAIL_RE.test(trimmedEmail)
        ? null
        : "Enter a valid email.";

  const subjectErr = subject.length > MAX_SUBJECT ? "Subject is too long." : null;

  const trimmedMsg = message.trim();
  const messageErr =
    trimmedMsg.length === 0
      ? "Message is required."
      : trimmedMsg.length < MIN_MESSAGE
        ? `Message must be at least ${MIN_MESSAGE} characters.`
        : message.length > MAX_MESSAGE
          ? `Message must be under ${MAX_MESSAGE} characters.`
          : null;

  const canSubmit =
    !submitting &&
    hpt === "" &&
    !emailErr &&
    !subjectErr &&
    !messageErr &&
    secondsSinceMount() >= MIN_SECONDS_BEFORE_SUBMIT;

  const subjectLeft = MAX_SUBJECT - subject.length;
  const messageLeft = MAX_MESSAGE - message.length;

  function secondsSinceMount() {
    return Math.floor((Date.now() - mountedAtRef.current) / 1000);
  }

  // ---------- spam feedback ----------
  useEffect(() => {
    if (hpt !== "") {
      toast.error("Form error. Please refresh and try again.");
    }
  }, [hpt]);

  // ---------- draft autosave / restore ----------
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const d = JSON.parse(raw) as Partial<Draft>;
        setName(d.name ?? "");
        setEmail(d.email ?? "");
        setSubject(d.subject ?? "");
        setMessage(d.message ?? "");
        setType((d.type as TicketType) ?? "CONTACT");
      }
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const draft: Draft = { name, email, subject, message, type };
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(draft));
    } catch {
      /* ignore quota */
    }
  }, [name, email, subject, message, type]);

  // ---------- submit ----------
  async function submit(e: React.FormEvent) {
    e.preventDefault();

    if (secondsSinceMount() < MIN_SECONDS_BEFORE_SUBMIT) {
      toast.error("Please take a moment to fill the form before sending.");
      return;
    }
    if (!canSubmit) {
      toast.error("Please fix the highlighted fields.");
      return;
    }

    setSubmitting(true);
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const ac = abortRef.current;

    const timeout = setTimeout(() => {
      try {
        ac?.abort();
      } catch {}
    }, 15_000);

    try {
      const r = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: ac.signal,
        body: JSON.stringify({
          type,
          name: name.trim(),
          email: trimmedEmail,
          subject: subject.trim(),
          message: trimmedMsg,
          hpt,
          // lightweight meta can help triage on the backend
          meta: { ua: typeof navigator !== "undefined" ? navigator.userAgent : "" },
        }),
      });

      let j: any = null;
      try {
        j = await r.json();
      } catch {
        /* ignore */
      }

      if (!r.ok || j?.error) {
        const msg = j?.error || `Failed to send (HTTP ${r.status})`;
        throw new Error(msg);
      }

      toast.success("Thanks! We’ll get back to you soon.");
      setSentOnce(true);
      setName("");
      setEmail("");
      setSubject("");
      setMessage("");
      try {
        localStorage.removeItem(LS_KEY);
      } catch {}
    } catch (err: any) {
      if (err?.name === "AbortError") {
        toast.error("Request timed out. Please try again.");
      } else {
        toast.error(err?.message || "Something went wrong - please try again.");
      }
    } finally {
      clearTimeout(timeout);
      setSubmitting(false);
    }
  }

  const headerBlurb = useMemo(() => {
    switch (type) {
      case "BUG":
        return "Found a bug or technical issue? Share as much detail as you can.";
      case "OTHER":
        return "Have a request or something else on your mind? We’re listening.";
      default:
        return "Questions, partnerships, feedback - we’d love to hear from you.";
    }
  }, [type]);

  return (
    <div className="container-page bg-[var(--bg)] py-4 text-[var(--text)] sm:py-6">
      <div className="mx-auto max-w-2xl">
        {/* Header */}
        <div className="overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 shadow-soft sm:p-6">
          {/* Brand strip (tiny, on-brand) */}
          <div className="h-1.5 w-full bg-gradient-to-r from-[#161748] via-[#478559] to-[#39a0ca]" />

          <div className="pt-3 sm:pt-4">
            <h1 className="text-xl font-extrabold text-[var(--text)] sm:text-2xl md:text-3xl">
              Contact QwikSale
            </h1>
            <p className="mt-1 text-xs text-[var(--text-muted)] sm:text-sm">
              {headerBlurb}
            </p>
            <p className="mt-2 text-xs text-[var(--text-muted)]" aria-live="polite">
              We usually respond within 1-2 business days.
            </p>
          </div>
        </div>

        <ul className="mt-2 flex gap-2 overflow-x-auto whitespace-nowrap [-webkit-overflow-scrolling:touch] pb-1 sm:mt-3 sm:flex-wrap sm:overflow-visible sm:whitespace-normal">
          <li className="chip-outline">Support</li>
          <li className="chip-outline">Bug report</li>
          <li className="chip-outline">Feedback</li>
        </ul>

        <div className="mt-4 space-y-4 sm:mt-6 sm:space-y-6">
          {/* Success helper */}
          {sentOnce && (
            <div
              className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-3 py-2.5 text-sm text-[var(--text)] shadow-sm sm:px-4 sm:py-3"
              aria-live="polite"
            >
              Message sent - thanks! If you don’t see a reply, check your spam
              folder or add support@qwiksale.sale to your contacts.
            </div>
          )}

          {/* Form */}
          <form
            onSubmit={submit}
            className="card-surface rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-2.5 shadow-soft sm:p-5"
            noValidate
            aria-busy={submitting}
          >
            {/* invisible live region for validation summaries */}
            <span className="sr-only" role="status" aria-live="polite">
              {emailErr || subjectErr || messageErr ? "Form has validation errors" : ""}
            </span>

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label
                  htmlFor="name"
                  className="label mb-1 block text-sm font-semibold text-[var(--text)]"
                >
                  Your name{" "}
                  <span className="text-[var(--text-muted)]">(optional)</span>
                </label>
                <input
                  id="name"
                  className="input w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[var(--text)] placeholder:text-[var(--text-muted)] outline-none focus-visible:outline-none focus-visible:ring-2 ring-focus"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Jane Doe"
                  autoComplete="name"
                />
              </div>

              <div>
                <label
                  htmlFor="email"
                  className="label mb-1 block text-sm font-semibold text-[var(--text)]"
                >
                  Email <span className="text-[var(--text-muted)]">*</span>
                </label>
                <input
                  id="email"
                  type="email"
                  className="input w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[var(--text)] placeholder:text-[var(--text-muted)] outline-none focus-visible:outline-none focus-visible:ring-2 ring-focus"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  aria-invalid={!!emailErr}
                  aria-describedby={emailErr ? "email-err" : undefined}
                  required
                />
                {emailErr && (
                  <p id="email-err" className="mt-1 text-xs text-[var(--text-muted)]">
                    {emailErr}
                  </p>
                )}
              </div>
            </div>

            <div className="mt-2 grid gap-3 md:mt-3 md:grid-cols-2">
              <div>
                <label
                  htmlFor="topic"
                  className="label mb-1 block text-sm font-semibold text-[var(--text)]"
                >
                  Topic
                </label>
                <select
                  id="topic"
                  className="input w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[var(--text)] outline-none focus-visible:outline-none focus-visible:ring-2 ring-focus"
                  value={type}
                  onChange={(e) => setType(e.target.value as TicketType)}
                >
                  <option value="CONTACT">General</option>
                  <option value="BUG">Bug / Technical</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="subject"
                  className="label mb-1 block text-sm font-semibold text-[var(--text)]"
                >
                  Subject{" "}
                  <span className="text-[var(--text-muted)]">(optional)</span>
                </label>
                <input
                  id="subject"
                  className="input w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[var(--text)] placeholder:text-[var(--text-muted)] outline-none focus-visible:outline-none focus-visible:ring-2 ring-focus"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="How can we help?"
                  maxLength={MAX_SUBJECT}
                  aria-invalid={!!subjectErr}
                  aria-describedby={subjectErr ? "subject-err" : "subject-help"}
                />
                <div className="mt-1 flex items-center justify-between">
                  {subjectErr ? (
                    <p id="subject-err" className="text-xs text-[var(--text-muted)]">
                      {subjectErr}
                    </p>
                  ) : (
                    <p id="subject-help" className="text-xs text-[var(--text-muted)]">
                      {subjectLeft} characters left
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Honeypot */}
            <div className="hidden">
              <label htmlFor="hp">Leave empty</label>
              <input
                id="hp"
                value={hpt}
                onChange={(e) => setHpt(e.target.value)}
                tabIndex={-1}
                autoComplete="off"
              />
            </div>

            <div className="mt-2 md:mt-3">
              <label
                htmlFor="message"
                className="label mb-1 block text-sm font-semibold text-[var(--text)]"
              >
                Message <span className="text-[var(--text-muted)]">*</span>
              </label>
              <textarea
                id="message"
                className="input min-h-[8rem] w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[var(--text)] placeholder:text-[var(--text-muted)] outline-none focus-visible:outline-none focus-visible:ring-2 ring-focus sm:min-h-40"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Share details so we can help quickly…"
                maxLength={MAX_MESSAGE}
                aria-invalid={!!messageErr}
                aria-describedby={messageErr ? "message-err" : "message-help"}
                required
              />
              <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                {messageErr ? (
                  <p id="message-err" className="text-xs text-[var(--text-muted)]">
                    {messageErr}
                  </p>
                ) : (
                  <p id="message-help" className="text-xs text-[var(--text-muted)]">
                    {messageLeft} characters left
                  </p>
                )}
                <p className="text-xs text-[var(--text-muted)]">
                  We respond within 1-2 business days.
                </p>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-[11px] text-[var(--text-muted)] sm:text-[12px]">
                This form is protected by basic anti-spam measures.
              </p>
              <button
                disabled={!canSubmit}
                className="btn-gradient-primary min-h-[44px] rounded-xl px-4 py-2.5 text-xs font-semibold disabled:opacity-60 sm:text-sm"
                aria-disabled={!canSubmit}
                type="submit"
                aria-label="Send message"
              >
                {submitting ? "Sending…" : "Send message"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
