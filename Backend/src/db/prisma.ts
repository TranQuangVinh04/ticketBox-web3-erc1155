import { PrismaClient } from "@prisma/client";

import { env } from "../config/env";

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

function ensureDatabaseUrl() {
  if (!env.DATABASE_URL) {
    throw new Error("Missing DATABASE_URL. Set DATABASE_URL in .env (or as an env var) before using Prisma.");
  }
}

export function getPrisma() {
  ensureDatabaseUrl();

  if (!globalThis.__prisma) {
    globalThis.__prisma = new PrismaClient({
      log: env.NODE_ENV === "development" ? ["warn", "error"] : ["error"]
    });
  }

  return globalThis.__prisma;
}

// Back-compat: allow importing `prisma`, but now it is lazy.
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    return (getPrisma() as any)[prop];
  }
});

