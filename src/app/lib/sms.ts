export async function sendSmsAT(to: string, message: string): Promise<boolean> {
  const username = process.env.AT_USERNAME;
  const apiKey = process.env.AT_API_KEY;
  const from = process.env.AT_SENDER_ID || "QwikSale";
  if (!username || !apiKey) {
    console.warn("[sms] Missing AT_USERNAME/AT_API_KEY");
    return false;
  }

  // Africa's Talking SMS endpoint
  const endpoint = "https://api.africastalking.com/version1/messaging";

  // Minimal input sanity (prevents absurdly long payloads hitting the network)
  const cleanTo = String(to || "").slice(0, 20);
  const cleanMsg = String(message || "").slice(0, 459); // AT splits >160; keep under 480

  const form = new URLSearchParams({
    username,
    to: cleanTo,
    message: cleanMsg,
    from,
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000); // 10s timeout

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        apiKey, // required by AT
      },
      body: form.toString(),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      console.warn("[sms] AT non-OK:", res.status, txt);
      return false;
    }
    return true;
  } catch (e) {
    clearTimeout(timer);
    console.warn("[sms] AT fetch error:", e);
    return false;
  }
}
