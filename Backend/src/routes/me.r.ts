import { Router, type RequestHandler } from "express";

import { requireAuth, type AuthedRequest } from "../auth/middleware";
import { getMe } from "../controller/profile/me.c";
import { getPrisma } from "../db/prisma";
import { jsonSafe } from "../utils/json";
import { logActivity } from "../utils/activityLog";

export const meRouter = Router();

/**
 * GET /api/me  (Authorization: Bearer <token>)
 */
meRouter.get("/me", requireAuth, getMe as unknown as RequestHandler);

/**
 * PATCH /api/me/name  (Authorization: Bearer <token>)
 * body: { name: string }
 */
meRouter.patch(
  "/me/name",
  requireAuth,
  (async (req: AuthedRequest, res) => {
    const wallet = req.wallet;
    if (!wallet) {
      return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
    }

    const rawName =
      typeof req.body?.name === "string" ? req.body.name.trim() : "";
    if (!rawName) {
      return res
        .status(400)
        .json({ ok: false, error: "INVALID_NAME" });
    }

    const prisma = getPrisma();

    const user = await prisma.user.findFirst({
      where: {
        walletAddress: {
          equals: wallet,
          mode: "insensitive"
        }
      }
    });

    if (!user) {
      return res
        .status(404)
        .json({ ok: false, error: "NOT_FOUND" });
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { name: rawName }
    });

    await logActivity({
      req,
      userId: updated.id,
      walletAddress: updated.walletAddress,
      action: "PROFILE_UPDATE_NAME",
      meta: {
        oldName: user.name,
        newName: updated.name
      }
    });

    return res.json(
      jsonSafe({
        ok: true,
        user: updated
      })
    );
  }) as unknown as RequestHandler
);

