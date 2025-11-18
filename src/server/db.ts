// src/server/db.ts
// Legacy compatibility layer for server-side imports.
// Use "@/app/lib/prisma" as the single source of truth.

import { prisma } from "@/app/lib/prisma";

export { prisma };
export default prisma;
