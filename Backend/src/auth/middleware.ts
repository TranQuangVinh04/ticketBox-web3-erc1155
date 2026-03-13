import type { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "./jwt";

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

