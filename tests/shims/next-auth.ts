// tests/shims/next-auth.ts
// Minimal NextAuth shim for Vitest – avoids pulling in real next-auth / next/server.

type AuthConfig = Record<string, any>;
type AuthHandler = (req: Request) => Promise<Response>;

function createNextAuth(_config: AuthConfig) {
  async function auth() {
    // Default for tests: unauthenticated unless overridden via vi.mock on "@/auth".
    return null;
  }

  async function signIn() {
    return { ok: true };
  }

  async function signOut() {
    return { ok: true };
  }

  const handlers = {
    GET: (async () =>
      new Response("NextAuth GET handler (test shim)", {
        status: 501,
      })) as AuthHandler,
    POST: (async () =>
      new Response("NextAuth POST handler (test shim)", {
        status: 501,
      })) as AuthHandler,
  };

  return { handlers, auth, signIn, signOut };
}

export default createNextAuth;
