export function makeReq(url: string, init?: RequestInit): Request {
  const headers = new Headers(init?.headers || {});
  if (!headers.has("content-type")) headers.set("content-type", "application/json");
  return new Request(url, { ...init, headers });
}
