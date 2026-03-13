import type { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "./jwt";
import { getPrisma } from "../db/prisma";

export type AuthedRequest = Request & { wallet?: string };

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.header("authorization") ?? "";
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });

  try {
    const payload = verifyAccessToken(token);
    req.wallet = payload.wallet;
    return next();
  } catch {
    return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  }
}

export async function requireStaffOrOwner(
  req: AuthedRequest,
  res: Response,
  next: NextFunction
) {
  const wallet = req.wallet;
  if (!wallet) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });

  const prisma = getPrisma();
  const user = await prisma.user.findFirst({
    where: {
      walletAddress: {
        equals: wallet,
        mode: "insensitive"
      }
    },
    select: { role: true }
  });

  if (!user) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  if (user.role !== "STAFF" && user.role !== "OWNER") {
    return res.status(403).json({ ok: false, error: "FORBIDDEN" });
  }

  return next();
}

