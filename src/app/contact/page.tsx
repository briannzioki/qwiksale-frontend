// src/app/contact/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";

type TicketType = "CONTACT" | "BUG" | "OTHER";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_SUBJECT = 120;
const MAX_MESSAGE = 2000;
const MIN_MESSAGE = 10;

export default function ContactPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [type, setType] = useState<TicketType>("CONTACT");
  const [hpt, setHpt] = useState(""); // honeypot
  const [submitting, setSubmitting] = useState(false);
  const [sentOnce, setSentOnce] = useState(false);

  const emailErr =
    email.trim().length === 0 ? null : EMAIL_RE.test(email.trim()) ? null : "Enter a valid email.";
  const subjectErr = subject.length > MAX_SUBJECT ? "Subject is too long." : null;
  const messageErr =
    message.trim().length === 0
      ? null
      : message.trim().length < MIN_MESSAGE
      ? `Message must be at least ${MIN_MESSAGE} characters.`
      : message.length > MAX_MESSAGE
      ? `Message must be under ${MAX_MESSAGE} characters.`
      : null;

  const canSubmit =
    !submitting &&
    hpt === "" && // bots fill this
    (!emailErr || email.trim().length === 0 ? true : false) &&
    !subjectErr &&
    !messageErr &&
    message.trim().length >= MIN_MESSAGE;

  const subjectLeft = MAX_SUBJECT - subject.length;
  const messageLeft = MAX_MESSAGE - message.length;

  useEffect(() => {
    // small UX: let users know when we block bots
    if (hpt !== "") {
      toast.error("Form error. Please refresh and try again.");
    }
  }, [hpt]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) {
      toast.error("Please fix the highlighted fields.");
      return;
    }
    setSubmitting(true);
    try {
      const r = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          name: name.trim(),
          email: email.trim(),
          subject: subject.trim(),
          message: message.trim(),
          hpt,
        }),
      });

      // try to parse JSON (best-effort)
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
    } catch (err: any) {
      toast.error(err?.message || "Something went wrong — please try again.");
    } finally {
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
        return "Questions, partnerships, feedback — we’d love to hear from you.";
    }
  }, [type]);

  return (
    <div className="container-page py-8">
      <div className="mx-auto max-w-2xl space-y-6">
        {/* Hero */}
        <div className="hero-surface rounded-2xl p-6 text-white shadow-soft">
          <h1 className="text-2xl md:text-3xl font-extrabold">Contact QwikSale</h1>
          <p className="text-sm text-white/85">{headerBlurb}</p>
          <p className="mt-2 text-xs text-white/70">
            We usually respond within 1–2 business days.
          </p>
        </div>

        {/* Success helper */}
        {sentOnce && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-200">
            Message sent — thanks! If you don’t see a reply, check your spam folder or add
            support@qwiksale.sale to your contacts.
          </div>
        )}

        {/* Form */}
        <form
          onSubmit={submit}
          className="card-surface rounded-xl border bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"
          noValidate
        >
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label htmlFor="name" className="label block text-sm font-semibold mb-1">
                Your name <span className="text-gray-400">(optional)</span>
              </label>
              <input
                id="name"
                className="input w-full rounded-lg border px-3 py-2 outline-none focus:ring-2 focus:ring-brandBlue/40 dark:border-slate-700 dark:bg-slate-950"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jane Doe"
                autoComplete="name"
              />
            </div>

            <div>
              <label htmlFor="email" className="label block text-sm font-semibold mb-1">
                Email
              </label>
              <input
                id="email"
                type="email"
                className={`input w-full rounded-lg border px-3 py-2 outline-none focus:ring-2 dark:border-slate-700 dark:bg-slate-950 ${
                  emailErr ? "border-red-400 focus:ring-red-300" : "focus:ring-brandBlue/40"
                }`}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                aria-invalid={!!emailErr}
                aria-describedby={emailErr ? "email-err" : undefined}
                required
              />
              {emailErr && (
                <p id="email-err" className="mt-1 text-xs text-red-600">
                  {emailErr}
                </p>
              )}
            </div>
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div>
              <label htmlFor="topic" className="label block text-sm font-semibold mb-1">
                Topic
              </label>
              <select
                id="topic"
                className="input w-full rounded-lg border px-3 py-2 outline-none focus:ring-2 focus:ring-brandBlue/40 dark:border-slate-700 dark:bg-slate-950"
                value={type}
                onChange={(e) => setType(e.target.value as TicketType)}
              >
                <option value="CONTACT">General</option>
                <option value="BUG">Bug / Technical</option>
                <option value="OTHER">Other</option>
              </select>
            </div>

            <div>
              <label htmlFor="subject" className="label block text-sm font-semibold mb-1">
                Subject <span className="text-gray-400">(optional)</span>
              </label>
              <input
                id="subject"
                className={`input w-full rounded-lg border px-3 py-2 outline-none focus:ring-2 dark:border-slate-700 dark:bg-slate-950 ${
                  subjectErr ? "border-red-400 focus:ring-red-300" : "focus:ring-brandBlue/40"
                }`}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="How can we help?"
                maxLength={MAX_SUBJECT}
                aria-invalid={!!subjectErr}
                aria-describedby={subjectErr ? "subject-err" : "subject-help"}
              />
              <div className="mt-1 flex items-center justify-between">
                {subjectErr ? (
                  <p id="subject-err" className="text-xs text-red-600">
                    {subjectErr}
                  </p>
                ) : (
                  <p id="subject-help" className="text-xs text-gray-500">
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

          <div className="mt-3">
            <label htmlFor="message" className="label block text-sm font-semibold mb-1">
              Message
            </label>
            <textarea
              id="message"
              className={`input min-h-40 w-full rounded-lg border px-3 py-2 outline-none focus:ring-2 dark:border-slate-700 dark:bg-slate-950 ${
                messageErr ? "border-red-400 focus:ring-red-300" : "focus:ring-brandBlue/40"
              }`}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Share details so we can help quickly…"
              maxLength={MAX_MESSAGE}
              aria-invalid={!!messageErr}
              aria-describedby={messageErr ? "message-err" : "message-help"}
              required
            />
            <div className="mt-1 flex items-center justify-between">
              {messageErr ? (
                <p id="message-err" className="text-xs text-red-600">
                  {messageErr}
                </p>
              ) : (
                <p id="message-help" className="text-xs text-gray-500">
                  {messageLeft} characters left
                </p>
              )}
              <p className="text-xs text-gray-400">We respond within 1–2 business days.</p>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <p className="text-[12px] text-gray-500 dark:text-slate-400">
              This form is protected by basic anti-spam measures.
            </p>
            <button
              disabled={!canSubmit}
              className="btn-primary rounded-xl px-4 py-2 font-semibold disabled:opacity-60"
              aria-disabled={!canSubmit}
            >
              {submitting ? "Sending…" : "Send message"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
