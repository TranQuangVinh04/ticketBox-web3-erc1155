import type { Response } from "express";

import type { AuthedRequest } from "../../auth/middleware";
import { getPrisma } from "../../db/prisma";

export async function markBellRead(req: AuthedRequest, res: Response) {
  const wallet = req.wallet;
  if (!wallet) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });

  const { id } = req.params;
  if (!id) return res.status(400).json({ ok: false, error: "MISSING_ID" });

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

  await prisma.bell_notifications.updateMany({
    where: {
      id,
      userId: user.id
    },
    data: {
      readAt: new Date()
    }
  });

  return res.json({ ok: true });
}

export async function markAllBellRead(req: AuthedRequest, res: Response) {
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

  await prisma.bell_notifications.updateMany({
    where: {
      userId: user.id,
      readAt: null
    },
    data: {
      readAt: new Date()
    }
  });

  return res.json({ ok: true });
}

