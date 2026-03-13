import { Router, type RequestHandler } from "express";

import { requireAuth, requireStaffOrOwner } from "../auth/middleware";
import { getPrisma } from "../db/prisma";
import { jsonSafe } from "../utils/json";

export const adminActivityRouter = Router();

adminActivityRouter.get(
  "/admin/activity",
  requireAuth,
  requireStaffOrOwner as unknown as RequestHandler,
  (async (req, res) => {
    const prisma = getPrisma();

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 20));
    const action =
      typeof req.query.action === "string" && req.query.action.trim()
        ? req.query.action.trim()
        : undefined;
    const wallet =
      typeof req.query.wallet === "string" && req.query.wallet.trim()
        ? req.query.wallet.trim()
        : undefined;

    const where: any = {};
    if (action) where.action = action;
    if (wallet) {
      where.walletAddress = {
        equals: wallet,
        mode: "insensitive"
      };
    }

    const [total, items] = await Promise.all([
      prisma.activity_logs.count({ where }),
      prisma.activity_logs.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit
      })
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    return res.json(
      jsonSafe({
        ok: true,
        items,
        page,
        limit,
        total,
        totalPages
      })
    );
  }) as unknown as RequestHandler
);

