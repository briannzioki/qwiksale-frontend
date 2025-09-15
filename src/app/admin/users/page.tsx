// src/app/admin/users/page.tsx
export const dynamic = "force-dynamic";

type AdminUser = {
  id: string;
  email: string | null;
  name: string | null;
  username: string | null;
  role: string | null;
  createdAt: string | null;
};

export default async function Page() {
  const res = await fetch("/api/admin/users?limit=100", { cache: "no-store" });
  if (!res.ok) {
    return (
      <div className="rounded-xl border bg-white p-4 text-sm text-red-600 dark:border-slate-800 dark:bg-slate-900 dark:text-red-400">
        Failed to load users.
      </div>
    );
  }
  const users = (await res.json()) as AdminUser[];

  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <h2 className="mb-3 text-lg font-bold">Users</h2>
      <div className="overflow-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left">
              <th className="px-2 py-1">ID</th>
              <th className="px-2 py-1">Email</th>
              <th className="px-2 py-1">Name</th>
              <th className="px-2 py-1">Username</th>
              <th className="px-2 py-1">Role</th>
              <th className="px-2 py-1">Created</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-gray-100 dark:border-slate-800">
                <td className="px-2 py-1 font-mono text-xs">{u.id}</td>
                <td className="px-2 py-1">{u.email ?? "—"}</td>
                <td className="px-2 py-1">{u.name ?? "—"}</td>
                <td className="px-2 py-1">{u.username ?? "—"}</td>
                <td className="px-2 py-1">{u.role ?? "USER"}</td>
                <td className="px-2 py-1">
                  {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
