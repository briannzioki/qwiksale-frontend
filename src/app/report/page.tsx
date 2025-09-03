"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import toast from "react-hot-toast";

export default function ReportPage() {
  const sp = useSearchParams();
  const initialProductId = sp.get("productId") || sp.get("id") || "";
  const [type, setType] = useState<"REPORT_LISTING"|"REPORT_USER"|"BUG">("REPORT_LISTING");
  const [productId, setProductId] = useState(initialProductId);
  const [url, setUrl] = useState("");
  const [message, setMessage] = useState("");
  const [hpt, setHpt] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") setUrl(window.location.href);
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) return toast.error("Describe the problem briefly.");
    setSubmitting(true);
    try {
      const r = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, productId: productId || null, url, message, hpt }),
      });
      const j = await r.json();
      if (!r.ok || j?.error) throw new Error(j?.error || "Failed to submit");
      toast.success("Report received. Thank you for keeping QwikSale safe.");
      setMessage("");
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
          <h1 className="text-2xl md:text-3xl font-extrabold">Report a problem</h1>
          <p className="text-sm text-white/80">Flag suspicious listings, safety issues, or technical bugs.</p>
        </div>

        <form onSubmit={submit} className="card-surface p-4 space-y-4">
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <label className="label">Report type</label>
              <select className="input" value={type} onChange={(e)=>setType(e.target.value as any)}>
                <option value="REPORT_LISTING">Problem with a listing</option>
                <option value="REPORT_USER">Problem with a user</option>
                <option value="BUG">Bug / Technical issue</option>
              </select>
            </div>
            <div>
              <label className="label">Listing ID (optional)</label>
              <input className="input" value={productId} onChange={(e)=>setProductId(e.target.value)} placeholder="Paste product ID if relevant" />
            </div>
          </div>

          <div>
            <label className="label">Page URL (auto)</label>
            <input className="input" value={url} onChange={(e)=>setUrl(e.target.value)} />
          </div>

          <div className="hidden">
            <label>Leave empty</label>
            <input value={hpt} onChange={(e)=>setHpt(e.target.value)} />
          </div>

          <div>
            <label className="label">What happened?</label>
            <textarea className="input min-h-32" value={message} onChange={(e)=>setMessage(e.target.value)} />
            <p className="text-xs text-gray-500 mt-1">
              Don’t share sensitive info. We may contact you for details.
            </p>
          </div>

          <button disabled={submitting} className="btn-primary">
            {submitting ? "Sending…" : "Send report"}
          </button>
        </form>
      </div>
    </div>
  );
}
