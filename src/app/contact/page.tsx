"use client";

import { useState, useEffect } from "react";
import toast from "react-hot-toast";

export default function ContactPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [type, setType] = useState<"CONTACT" | "BUG" | "OTHER">("CONTACT");
  const [hpt, setHpt] = useState(""); // honeypot
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) return toast.error("Please write your message.");
    setSubmitting(true);
    try {
      const r = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, name, email, subject, message, hpt }),
      });
      const j = await r.json();
      if (!r.ok || j?.error) throw new Error(j?.error || "Failed to send");
      toast.success("Thanks! We’ll get back to you.");
      setName(""); setEmail(""); setSubject(""); setMessage("");
    } catch (err: any) {
      toast.error(err?.message || "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="container-page py-8">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="hero-surface">
          <h1 className="text-2xl md:text-3xl font-extrabold">Contact QwikSale</h1>
          <p className="text-sm text-white/80">Questions, partnerships, feedback — we’d love to hear from you.</p>
        </div>

        <form onSubmit={submit} className="card-surface p-4 space-y-4">
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <label className="label">Your name</label>
              <input className="input" value={name} onChange={(e)=>setName(e.target.value)} />
            </div>
            <div>
              <label className="label">Email</label>
              <input type="email" className="input" value={email} onChange={(e)=>setEmail(e.target.value)} />
            </div>
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <label className="label">Topic</label>
              <select className="input" value={type} onChange={(e)=>setType(e.target.value as any)}>
                <option value="CONTACT">General</option>
                <option value="BUG">Bug / Technical</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            <div>
              <label className="label">Subject</label>
              <input className="input" value={subject} onChange={(e)=>setSubject(e.target.value)} />
            </div>
          </div>

          <div className="hidden">
            <label>Leave empty</label>
            <input value={hpt} onChange={(e)=>setHpt(e.target.value)} />
          </div>

          <div>
            <label className="label">Message</label>
            <textarea className="input min-h-32" value={message} onChange={(e)=>setMessage(e.target.value)} />
            <p className="text-xs text-gray-500 mt-1">We respond within 1–2 business days.</p>
          </div>

          <button disabled={submitting} className="btn-primary">
            {submitting ? "Sending…" : "Send message"}
          </button>
        </form>
      </div>
    </div>
  );
}
