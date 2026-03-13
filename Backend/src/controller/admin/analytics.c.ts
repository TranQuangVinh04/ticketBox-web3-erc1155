import type { Response } from "express";
import { Contract, JsonRpcProvider } from "ethers";

import type { AuthedRequest } from "../../auth/middleware";
import { requireStaffOrOwner } from "../../auth/middleware";
import { getPrisma } from "../../db/prisma";
import { jsonSafe } from "../../utils/json";
import { env } from "../../config/env";

function asEth(amountWei: bigint | null | undefined): number | null {
  if (amountWei == null) return null;
  const wei = BigInt(amountWei.toString());
  const eth = Number(wei) / 1e18;
  return Number.isFinite(eth) ? eth : null;
}

function resolveRpcUrl(chainId?: number): string | undefined {
  if (chainId && Number.isFinite(chainId)) {
    const key = `CHAIN_RPC_URL_${chainId}`;
    const specific = process.env[key];
    if (typeof specific === "string" && specific.trim()) {
      return specific.trim();
    }
  }
  return env.CHAIN_RPC_URL;
}

const TICKET_PRICE_ABI = [
  "function ticketPrices(uint256 id) view returns (uint256)"
];

async function fetchTicketPriceWei(params: {
  chainId: number | null | undefined;
  contractAddress: string | null | undefined;
  tokenId: bigint;
}): Promise<bigint | null> {
  const { chainId, contractAddress, tokenId } = params;
  if (!contractAddress) return null;

  const rpcUrl = resolveRpcUrl(chainId ?? undefined);
  if (!rpcUrl) return null;

  try {
    const provider = new JsonRpcProvider(rpcUrl, chainId ?? undefined);
    const contract = new Contract(contractAddress, TICKET_PRICE_ABI, provider);
    const raw = await contract.ticketPrices(tokenId.toString());
    const wei = BigInt(raw.toString());
    if (wei <= 0n) return null;
    return wei;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("fetchTicketPriceWei failed", e);
    return null;
  }
}

export async function analyticsOverviewHandler(
  req: AuthedRequest,
  res: Response
) {
  const wallet = req.wallet;
  if (!wallet) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });

  const prisma = getPrisma();

  // Authorize STAFF / OWNER via middleware logic
  // (reuse requireStaffOrOwner but we already passed auth)
  await requireStaffOrOwner(req, res, async () => {
    // Aggregate totals cho toàn hệ thống
    const [userCount, eventCount, ticketsSoldAgg, checkinsAgg] =
      await Promise.all([
        prisma.user.count(),
        prisma.event.count(),
        prisma.eventPurchase.aggregate({
          _sum: { quantity: true }
        }),
        prisma.tickets.aggregate({
          _sum: { amount: true },
          where: { status: "CHECKED_IN" }
        })
      ]);

    // Thống kê theo từng event
    const events = await prisma.event.findMany({
      include: {
        contract: true
      }
    });

    type EventRow = {
      eventId: string;
      name: string | null;
      chainId: number;
      tokenId: string;
      contractAddress: string | null;
      ticketsSold: number;
      checkins: number;
      priceEth: number | null;
      revenueEth: number | null;
    };

    const rows: EventRow[] = [];

    for (const ev of events) {
      const [soldAgg, checkins] = await Promise.all([
        prisma.eventPurchase.aggregate({
          _sum: { quantity: true },
          where: { eventId: ev.id }
        }),
        prisma.tickets.aggregate({
          _sum: { amount: true },
          where: { eventId: ev.id, status: "CHECKED_IN" }
        })
      ]);

      const ticketsSold = soldAgg._sum.quantity ?? 0;

      const priceWei = await fetchTicketPriceWei({
        chainId: ev.contract?.chainId ?? ev.chainId,
        contractAddress: ev.contract?.address ?? null,
        tokenId: ev.tokenId
      });

      const revenueWei =
        ticketsSold > 0 && priceWei != null
          ? BigInt(ticketsSold) * priceWei
          : null;

      rows.push({
        eventId: ev.id,
        name: ev.name ?? null,
        chainId: ev.chainId,
        tokenId: ev.tokenId.toString(),
        contractAddress: ev.contract?.address ?? null,
        ticketsSold,
        checkins: checkins._sum.amount ?? 0,
        priceEth: asEth(priceWei),
        revenueEth: asEth(revenueWei)
      });
    }

    const totalRevenueEth =
      rows.reduce((sum, r) => sum + (r.revenueEth ?? 0), 0) ?? 0;

    return res.json(
      jsonSafe({
        ok: true,
        overview: {
          totalUsers: userCount,
          totalTicketsSold: ticketsSoldAgg._sum.quantity ?? 0,
          totalEvents: eventCount,
          totalCheckins: checkinsAgg._sum.amount ?? 0,
          totalRevenueEth
        },
        events: rows
      })
    );
  });
}

