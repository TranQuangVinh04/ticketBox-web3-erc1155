import { Router, type RequestHandler } from "express";

import { requireAuth, requireStaffOrOwner } from "../auth/middleware";
import { getPrisma } from "../db/prisma";
import { jsonSafe } from "../utils/json";
import { logActivity } from "../utils/activityLog";

export const adminUsersRouter = Router();

adminUsersRouter.get(
  "/admin/users",
  requireAuth,
  requireStaffOrOwner as unknown as RequestHandler,
  (async (req, res) => {
    const prisma = getPrisma();

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 20));
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";

    const where = q
      ? {
          OR: [
            { walletAddress: { contains: q, mode: "insensitive" } },
            { name: { contains: q, mode: "insensitive" } }
          ]
        }
      : {};

    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          purchases: {
            select: { quantity: true }
          }
        }
      })
    ]);

    const items = users.map((u) => ({
      id: u.id,
      walletAddress: u.walletAddress,
      name: u.name,
      role: u.role,
      lastLoginAt: u.lastLoginAt,
      createdAt: u.createdAt,
      totalTickets: u.purchases.reduce((sum, p) => sum + p.quantity, 0)
    }));

    const totalPages = Math.ceil(total / limit) || 1;

    return res.json(
      jsonSafe({
        ok: true,
        users: items,
        total,
        page,
        limit,
        totalPages
      })
    );
  }) as unknown as RequestHandler
);

adminUsersRouter.patch(
  "/admin/users/:id",
  requireAuth,
  requireStaffOrOwner as unknown as RequestHandler,
  (async (req, res) => {
    const prisma = getPrisma();
    const id = req.params.id;
    const role = typeof req.body?.role === "string" ? req.body.role : "";

    if (!id || !role) {
      return res
        .status(400)
        .json({ ok: false, error: "INVALID_INPUT" });
    }

    if (!["USER", "STAFF", "OWNER"].includes(role)) {
      return res
        .status(400)
        .json({ ok: false, error: "INVALID_ROLE" });
    }

    const user = await prisma.user.update({
      where: { id },
      data: { role: role as any }
    });

    await logActivity({
      req,
      userId: user.id,
      walletAddress: user.walletAddress,
      action: "ADMIN_UPDATE_USER_ROLE",
      meta: {
        targetUserId: user.id,
        newRole: user.role
      }
    });

    return res.json(
      jsonSafe({
        ok: true,
        user: {
          id: user.id,
          role: user.role
        }
      })
    );
  }) as unknown as RequestHandler
);

