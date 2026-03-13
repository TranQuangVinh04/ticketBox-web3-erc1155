import type { Request } from "express";
import crypto from "node:crypto";

import { getPrisma } from "../db/prisma";

export async function logActivity(opts: {
  req?: Request;
  userId?: string | null;
  walletAddress?: string | null;
  action: string;
  meta?: unknown;
}) {
  try {
    const prisma = getPrisma();

    const ip =
      opts.req?.headers["x-forwarded-for"]?.toString().split(",")[0].trim() ||
      opts.req?.ip ||
      null;
    const userAgent =
      typeof opts.req?.headers["user-agent"] === "string"
        ? opts.req?.headers["user-agent"]
        : null;

    await prisma.activity_logs.create({
      data: {
        id: crypto.randomUUID(),
        userId: opts.userId ?? null,
        walletAddress: opts.walletAddress ?? null,
        action: opts.action,
        meta: (opts.meta ?? {}) as any,
        ip: ip ?? null,
        userAgent
      }
    });
  } catch {
    // Logging must never break main flow
  }
}

