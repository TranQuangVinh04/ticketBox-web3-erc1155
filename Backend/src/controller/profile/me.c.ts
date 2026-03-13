import type { Response } from "express";

import { getPrisma } from "../../db/prisma";
import { jsonSafe } from "../../utils/json";
import type { AuthedRequest } from "../../auth/middleware";

export async function getMe(req: AuthedRequest, res: Response): Promise<any> {
  const address = req.wallet;
  if (!address) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });

  const prisma = getPrisma();

  const user = await prisma.user.findUnique({
    where: { walletAddress: address },
    include: {
      purchases: {
        select: {
          id: true,
          event: {
            select: {
              id: true,
              tokenId: true,
              contract: {
                select: {
                  address: true,
                  chainId: true
                }
              }
            }
          }
        }
      },
      ticket_seats: {
        include: {
          events: {
            include: {
              contract: true
            }
          }
        }
      }
    }
  });

  // Build map: `${contractAddress}:${tokenId}` -> eventId
  const eventIdByContractTokenId: Record<string, string> = {};
  const seatByContractTokenId: Record<string, string[]> = {};

  if (user) {
    for (const p of user.purchases) {
      const ev = p.event;
      const addr = ev.contract?.address;
      const eventId = ev.id;
      const tokenId = ev.tokenId;
      if (typeof addr === "string" && typeof eventId === "string" && tokenId != null) {
        const key = `${addr.toLowerCase()}:${String(tokenId)}`;
        eventIdByContractTokenId[key] = eventId;
      }
    }

    for (const ts of user.ticket_seats) {
      const ev = ts.events;
      const addr = ev?.contract?.address;
      const tokenId = ev?.tokenId;
      if (!addr || tokenId == null) continue;
      const key = `${addr.toLowerCase()}:${String(tokenId)}`;
      const seat = ts.seatCode.trim();
      if (!seat) continue;
      if (!seatByContractTokenId[key]) seatByContractTokenId[key] = [];
      seatByContractTokenId[key].push(seat);
    }

    // Normalize seats: unique + sorted
    for (const [k, arr] of Object.entries(seatByContractTokenId)) {
      const uniq = Array.from(new Set(arr));
      uniq.sort((a, b) => {
        const na = Number(a);
        const nb = Number(b);
        if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
        return a.localeCompare(b);
      });
      seatByContractTokenId[k] = uniq;
    }
  }

  // Latest checkin notice for Profile auto-refresh
  let latestCheckinNotice: any = null;
  if (user) {
    const latest = await prisma.bell_notifications.findFirst({
      where: { userId: user.id, kind: "checkin" },
      orderBy: { createdAt: "desc" }
    });
    if (latest) {
      const meta = (latest.meta ?? {}) as any;
      latestCheckinNotice = {
        id: latest.id,
        ticketId: typeof meta?.ticketId === "string" ? meta.ticketId : null
      };
    }
  }

  return res.status(200).json({
    ok: true,
    user: jsonSafe(user),
    eventIdByContractTokenId: jsonSafe(eventIdByContractTokenId),
    seatByContractTokenId: jsonSafe(seatByContractTokenId),
    latestCheckinNotice: jsonSafe(latestCheckinNotice)
  });
}

