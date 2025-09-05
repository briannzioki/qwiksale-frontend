import { rateLimit } from "@/app/api/_lib/ratelimits";
import { clientKey } from "./request";

export async function guardRate(req: Request, scope: string) {
  const key = await clientKey(scope);
  const { success, reset } = await rateLimit.limit(key);
  if (!success) {
    return new Response("Slow down", {
      status: 429,
      headers: { "Retry-After": String(reset) },
    });
  }
  return null; // null means "go ahead"
}
