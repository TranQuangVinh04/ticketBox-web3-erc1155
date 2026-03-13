import crypto from "node:crypto";
import z from "zod";
import { getAddress } from "ethers";
import type { Request, Response } from "express";

import type { AuthedRequest } from "../../auth/middleware";
import { getPrisma } from "../../db/prisma";
import { jsonSafe } from "../../utils/json";
import { logActivity } from "../../utils/activityLog";

const SetPurchaseBodySchema = z.object({
  chainId: z.coerce.number().int().positive(),
  contractAddress: z.string().min(1),
  tokenId: z.string().min(1),
  quantity: z.coerce.number().int().positive().default(1),
  seat: z.string().min(1),
  ownerWallet: z.string().min(1)
});

export async function setPurchase(req: AuthedRequest, res: Response) {
  const wallet = req.wallet;
  if (!wallet) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });

  const parsed = SetPurchaseBodySchema.parse(req.body);
  const { chainId, contractAddress, tokenId, quantity, seat, ownerWallet } = parsed;

  const prisma = getPrisma();

  const buyer = getAddress(wallet);
  const owner = getAddress(ownerWallet);
  if (buyer !== owner) {
    return res.status(403).json({ ok: false, error: "OWNER_MISMATCH" });
  }

  const contractAddr = getAddress(contractAddress);

  const user = await prisma.user.findUnique({
    where: { walletAddress: buyer },
    select: { id: true }
  });

  if (!user) return res.status(404).json({ ok: false, error: "USER_NOT_FOUND" });

  const contract = await prisma.contract.findFirst({
    where: {
      chainId,
      address: {
        equals: contractAddr,
        mode: "insensitive"
      }
    }
  });

  if (!contract) return res.status(404).json({ ok: false, error: "CONTRACT_NOT_FOUND" });

  const tokenBigInt = BigInt(tokenId);

  const event = await prisma.event.findFirst({
    where: { contractId: contract.id, tokenId: tokenBigInt }
  });

  if (!event) return res.status(404).json({ ok: false, error: "EVENT_NOT_FOUND" });

  // Upsert purchase row and increment quantity for repeat buys
  const purchase = await prisma.eventPurchase.upsert({
    where: { userId_eventId: { userId: user.id, eventId: event.id } },
    create: { userId: user.id, eventId: event.id, quantity },
    update: { quantity: { increment: quantity } }
  });

  const seatCode = seat.trim().toUpperCase();

  try {
    await prisma.ticket_seats.create({
      data: {
        id: crypto.randomUUID(),
        userId: user.id,
        eventId: event.id,
        tokenId: event.tokenId,
        seatCode
      }
    });

    await logActivity({
      req,
      userId: user.id,
      walletAddress: buyer,
      action: "PURCHASE_SET",
      meta: {
        chainId,
        contractAddress: contractAddr,
        tokenId: tokenBigInt.toString(),
        seat: seatCode,
        quantity,
        eventId: event.id,
        purchaseId: purchase.id
      }
    });
  } catch (e) {
    // Unique constraint violation => seat already taken
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.toUpperCase().includes("UNIQUE") || msg.toUpperCase().includes("TICKET_SEATS_EVENTID_SEATCODE_KEY")) {
      return res
        .status(409)
        .json({ ok: false, error: "SEAT_TAKEN", message: "SEAT_TAKEN" });
    }
    return res
      .status(500)
      .json({ ok: false, error: "SEAT_SAVE_FAILED", message: msg });
  }

  return res.json(
    jsonSafe({
      ok: true,
      message: "SET_PURCHASE_SUCCESS",
      purchase: {
        id: purchase.id,
        quantity: purchase.quantity,
        event: { id: event.id, tokenId: event.tokenId, name: event.name },
        contract: { id: contract.id },
        seat: seatCode,
        seatSaved: true,
        seatSkippedReason: null
      }
    })
  );
}

export async function getTakenSeatsHandler(req: Request, res: Response) {
  const chainId = Number(req.query.chainId);
  const contractAddress = typeof req.query.contractAddress === "string" ? req.query.contractAddress : "";
  const tokenIdRaw = typeof req.query.tokenId === "string" ? req.query.tokenId : "";

  if (!Number.isFinite(chainId) || !contractAddress || !tokenIdRaw) {
    return res.status(400).json({ ok: false, error: "INVALID_INPUT" });
  }

  const prisma = getPrisma();

  const contractAddr = getAddress(contractAddress);
  const tokenBigInt = BigInt(tokenIdRaw);

  const contract = await prisma.contract.findFirst({
    where: {
      chainId,
      address: {
        equals: contractAddr,
        mode: "insensitive"
      }
    },
    select: { id: true }
  });

  if (!contract) {
    return res.json({ ok: true, takenSeats: [], mySeats: [] });
  }

  const event = await prisma.event.findFirst({
    where: { contractId: contract.id, tokenId: tokenBigInt },
    select: { id: true }
  });

  if (!event) {
    return res.json({ ok: true, takenSeats: [], mySeats: [] });
  }

  const seats = await prisma.ticket_seats.findMany({
    where: { eventId: event.id },
    select: { seatCode: true }
  });

  const takenSeats = seats.map((s) => s.seatCode);

  return res.json({ ok: true, takenSeats, mySeats: [] });
}