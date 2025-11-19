import { cookies as nextCookies } from "next/headers";
import HeaderClient from "@/app/components/HeaderClient";
import { getViewer } from "@/app/lib/auth";

/* ----------------------------- Cookie polyfill ----------------------------- */
async function readCookies() {
  const res: any = (nextCookies as any)();
  return typeof res?.then === "function" ? await res : res;
}

/** Check for any Auth.js/NextAuth-style session cookie server-side. */
async function hasAuthCookie() {
  const c = await readCookies();
  return Boolean(
    c.get("__Secure-next-auth.session-token")?.value ||
      c.get("next-auth.session-token")?.value ||
      c.get("__Secure-authjs.session-token")?.value ||
      c.get("authjs.session-token")?.value
  );
}

export default async function Header() {
  const viewer = await getViewer();
  const cookieSuggestsSignedIn = await hasAuthCookie();

  const isAuthed = Boolean(viewer?.id || viewer?.email || cookieSuggestsSignedIn);
  const isAdmin = Boolean(viewer?.isAdmin);

  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 bg-white dark:bg-slate-900 px-3 py-2 rounded shadow"
      >
        Skip to content
      </a>

      <HeaderClient
        initialAuth={{
          isAuthed,
          isAdmin,
        }}
      />
    </>
  );
}
