import type { Response } from "express";

import type { AuthedRequest } from "../../auth/middleware";
import { getPrisma } from "../../db/prisma";
import { jsonSafe } from "../../utils/json";

export async function listBell(req: AuthedRequest, res: Response) {
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
    select: { id: true }
  });

  if (!user) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });

  const notifications = await prisma.bell_notifications.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 50
  });

  return res.json({
    ok: true,
    notifications: jsonSafe(
      notifications.map((n) => ({
        id: n.id,
        kind: n.kind,
        title: n.title,
        message: n.message,
        createdAt: n.createdAt.toISOString(),
        readAt: n.readAt ? n.readAt.toISOString() : null
      }))
    )
  });
}

