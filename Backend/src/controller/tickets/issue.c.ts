import crypto from "node:crypto";
import type { Response } from "express";

import { getPrisma } from "../../db/prisma";
import { jsonSafe } from "../../utils/json";
import { env } from "../../config/env";
import type { AuthedRequest } from "../../auth/middleware";
import { logActivity } from "../../utils/activityLog";

const TTL_HOURS = 24;

function signPayload(payload: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

export async function issueTicket(req: AuthedRequest, res: Response) {
  const wallet = req.wallet;
  if (!wallet) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });

  const secret = env.QR_SIGNING_SECRET;
  if (!secret) {
    return res.status(503).json({ ok: false, error: "QR_VERIFY_NOT_CONFIGURED" });
  }

  const rawEventId =
    typeof req.body?.eventId === "string" ? req.body.eventId.trim() : "";
  const rawContract =
    typeof req.body?.contractAddress === "string" ? req.body.contractAddress.trim() : "";
  const rawTokenId =
    typeof req.body?.tokenId === "string" || typeof req.body?.tokenId === "number"
      ? String(req.body.tokenId)
      : "";
  const rawChainId =
    typeof req.body?.chainId === "number" || typeof req.body?.chainId === "string"
      ? Number(req.body.chainId)
      : undefined;

  const amount = Math.min(
    Math.max(1, Number(req.body?.amount) || 1),
    10
  );

  if (!rawEventId && (!rawContract || !rawTokenId)) {
    return res.status(400).json({
      ok: false,
      error: "VALIDATION_ERROR",
      message: "Must provide eventId or (contractAddress, tokenId)"
    });
  }

  const prisma = getPrisma();

  let event =
    rawEventId &&
    (await prisma.event.findUnique({
      where: { id: rawEventId },
      include: { contract: true }
    }));

  if (!event && rawContract && rawTokenId) {
    const tokenBigInt = BigInt(rawTokenId);

    event = await prisma.event.findFirst({
      where: {
        tokenId: tokenBigInt,
        contract: {
          address: { equals: rawContract, mode: "insensitive" },
          ...(rawChainId && Number.isFinite(rawChainId)
            ? { chainId: Number(rawChainId) }
            : {})
        }
      },
      include: { contract: true }
    });
  }

  if (!event) {
    return res.status(404).json({ ok: false, error: "EVENT_NOT_FOUND" });
  }

  const expiresAt = new Date(Date.now() + TTL_HOURS * 60 * 60 * 1000);
  const nonce = crypto.randomBytes(16).toString("hex");

  const ticket = await prisma.tickets.create({
    data: {
      id: crypto.randomUUID(),
      eventId: event.id,
      ownerWallet: wallet.toLowerCase(),
      tokenId: event.tokenId,
      amount,
      nonce,
      expiresAt,
      status: "PENDING",
      updatedAt: new Date()
    }
  });

  const payload = JSON.stringify({
    ticketId: ticket.id,
    nonce: ticket.nonce,
    eventId: event.id,
    tokenId: String(event.tokenId),
    contractAddress: event.contract?.address?.toLowerCase(),
    chainId: event.contract?.chainId,
    ownerWallet: ticket.ownerWallet,
    amount: ticket.amount,
    expiresAt: ticket.expiresAt.toISOString()
  });

  const sig = signPayload(payload, secret);
  const qrText = JSON.stringify({ data: payload, sig });

  await logActivity({
    req,
    userId: undefined,
    walletAddress: wallet.toLowerCase(),
    action: "TICKET_ISSUE_QR",
    meta: {
      ticketId: ticket.id,
      eventId: event.id,
      tokenId: String(event.tokenId),
      chainId: event.contract?.chainId,
      contractAddress: event.contract?.address?.toLowerCase(),
      amount: ticket.amount,
      expiresAt: ticket.expiresAt.toISOString()
    }
  });

  return res.status(200).json({
    ok: true,
    ticket: jsonSafe({
      id: ticket.id,
      eventId: ticket.eventId,
      tokenId: String(ticket.tokenId),
      amount: ticket.amount,
      status: ticket.status,
      expiresAt: ticket.expiresAt
    }),
    qr: { text: qrText }
  });
}

