// tests/shims/next-server.ts
// Minimal next/server + next/headers shim so next-auth & Next handlers work under Vitest.

export class NextResponse extends Response {
  constructor(body?: BodyInit | null, init?: ResponseInit) {
    const payload =
      typeof body === "string" || body == null ? body : JSON.stringify(body);
    super(payload as BodyInit, init);
  }

  static override json(body: any, init?: ResponseInit) {
    const headers = new Headers(init?.headers);
    if (!headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }
    return new NextResponse(
      typeof body === "string" ? body : JSON.stringify(body),
      { ...init, headers },
    );
  }
}

export class NextRequest extends Request {}

export function headers() {
  return new Headers();
}

export function cookies() {
  const jar = new Map<string, string>();
  return {
    get(name: string) {
      if (!jar.has(name)) return undefined;
      return { name, value: jar.get(name)! };
    },
    set(name: string, value: string) {
      jar.set(name, value);
    },
    delete(name: string) {
      jar.delete(name);
    },
  };
}

export const draftMode = () => ({
  enable: () => {},
  disable: () => {},
});

export const unstable_noStore = () => {};

export function redirect(url: string | URL): never {
  throw new Error(`next/server redirect to ${url}`);
}

export function permanentRedirect(url: string | URL): never {
  throw new Error(`next/server permanentRedirect to ${url}`);
}

export function notFound(): never {
  throw new Error("next/server notFound");
}
