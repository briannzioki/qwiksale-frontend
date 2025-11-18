// src/server/prisma.ts
// Legacy compatibility for older imports expecting "server/prisma".
// Delegates to the canonical client.

import { prisma } from "@/app/lib/prisma";

export { prisma };
export default prisma;
