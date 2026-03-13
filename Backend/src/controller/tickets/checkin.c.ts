import crypto from "node:crypto";
import type { Request, Response } from "express";
import { Contract, JsonRpcProvider, Wallet } from "ethers";

import { getPrisma } from "../../db/prisma";
import { jsonSafe } from "../../utils/json";
import { env } from "../../config/env";
import { logActivity } from "../../utils/activityLog";

const BALANCE_OF_ABI = [
  "function balanceOf(address account, uint256 id) view returns (uint256)"
];

const BURN_TICKET_ABI = [
  "function burnTicket(address account, uint256 id, uint256 amount)",
  "function balanceOf(address account, uint256 id) view returns (uint256)"
];

function signPayload(payload: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

function ticketTypeLabelByTokenId(tokenId: string): "VIP" | "VVIP" | "Thường" {
  if (tokenId === "2") return "VIP";
  if (tokenId === "3") return "VVIP";
  return "Thường";
}

function seatingHintByTicketType(ticketType: "VIP" | "VVIP" | "Thường"): string {
  if (ticketType === "VIP") {
    return "Bạn có thể ngồi trong khu ghế VIP còn trống. Xin cảm ơn.";
  }
  if (ticketType === "VVIP") {
    return "Bạn có thể ngồi trong khu ghế VVIP còn trống. Xin cảm ơn.";
  }
  return "Bạn có thể ngồi bất cứ đâu ở khu ghế thường nếu còn ghế trống. Xin cảm ơn.";
}

function prettifyEventName(raw?: string | null): string | undefined {
  if (!raw || !raw.trim()) return undefined;
  const cleaned = raw
    .replace(/-(thuong|vip|vvip)$/i, "")
    .replace(/-/g, " ")
    .trim();
  if (!cleaned) return undefined;
  return cleaned
    .split(/\s+/)
    .map((w) => (w ? w[0]?.toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function resolveRpcUrl(chainId?: number): string | undefined {
  if (chainId && Number.isFinite(chainId)) {
    const chainKey = `CHAIN_RPC_URL_${chainId}`;
    const byChain = process.env[chainKey];
    if (typeof byChain === "string" && byChain.trim()) return byChain.trim();
  }
  return env.CHAIN_RPC_URL;
}

import { notifyBell } from "../bell/stream.c";

export async function checkin(req: Request, res: Response) {
  const secret = env.QR_SIGNING_SECRET;
  if (!secret) {
    return res.status(503).json({ ok: false, error: "QR_VERIFY_NOT_CONFIGURED" });
  }

  const qrText =
    req.body && typeof req.body.qrText === "string" ? req.body.qrText.trim() : "";
  if (!qrText) {
    return res
      .status(400)
      .json({ ok: false, error: "QR_INVALID_FORMAT", message: "qrText is required" });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(qrText);
  } catch {
    return res.status(400).json({ ok: false, error: "QR_INVALID_JSON" });
  }

  const data =
    typeof (parsed as any).data === "string" ? (parsed as any).data : undefined;
  const sig =
    typeof (parsed as any).sig === "string" ? (parsed as any).sig : undefined;

  if (!data || !sig) {
    return res.status(400).json({ ok: false, error: "QR_INVALID_FORMAT" });
  }

  const expectedSig = signPayload(data, secret);
  const sigBuf = Buffer.from(sig, "hex");
  const expectedBuf = Buffer.from(expectedSig, "hex");

  if (
    sigBuf.length !== expectedBuf.length ||
    !crypto.timingSafeEqual(sigBuf, expectedBuf)
  ) {
    return res.status(400).json({ ok: false, error: "QR_BAD_SIGNATURE" });
  }

  let payload: any;
  try {
    payload = JSON.parse(data);
  } catch {
    return res.status(400).json({ ok: false, error: "QR_BAD_PAYLOAD" });
  }

  const ticketId =
    typeof payload.ticketId === "string" ? payload.ticketId : undefined;
  const nonce = typeof payload.nonce === "string" ? payload.nonce : undefined;
  const expiresAt =
    typeof payload.expiresAt === "string" ? payload.expiresAt : undefined;

  if (!ticketId || !nonce) {
    return res.status(400).json({ ok: false, error: "QR_BAD_PAYLOAD" });
  }

  if (expiresAt && new Date(expiresAt) < new Date()) {
    return res.status(400).json({ ok: false, error: "QR_EXPIRED" });
  }

  const prisma = getPrisma();

  const ticket = await prisma.tickets.findUnique({
    where: { id: ticketId },
    include: { events: { include: { contract: true } } }
  });

  if (!ticket) {
    return res.status(404).json({ ok: false, error: "TICKET_NOT_FOUND" });
  }

  if (ticket.nonce !== nonce) {
    return res.status(400).json({ ok: false, error: "NONCE_MISMATCH" });
  }

  if (ticket.status === "CHECKED_IN") {
    return res.status(400).json({ ok: false, error: "ALREADY_CHECKED_IN" });
  }

  if (ticket.expiresAt < new Date()) {
    return res.status(400).json({ ok: false, error: "QR_EXPIRED" });
  }

  const payloadEventId =
    typeof payload.eventId === "string" ? payload.eventId : undefined;
  if (payloadEventId && payloadEventId !== ticket.eventId) {
    return res.status(400).json({ ok: false, error: "EVENT_MISMATCH" });
  }

  const payloadContractAddress =
    typeof payload.contractAddress === "string"
      ? payload.contractAddress
      : undefined;
  const ticketContractAddress = ticket.events?.contract?.address ?? undefined;

  if (
    payloadContractAddress &&
    ticketContractAddress &&
    payloadContractAddress.toLowerCase() !==
      ticketContractAddress.toLowerCase()
  ) {
    return res.status(400).json({ ok: false, error: "CONTRACT_MISMATCH" });
  }

  const contractAddress = ticketContractAddress ?? payloadContractAddress;
  if (!contractAddress) {
    return res.status(400).json({ ok: false, error: "CONTRACT_MISSING" });
  }

  const ownerWallet =
    (typeof payload.ownerWallet === "string"
      ? payload.ownerWallet
      : undefined) ?? ticket.ownerWallet;

  const ownerMatchesTicket =
    ownerWallet.toLowerCase() === ticket.ownerWallet.toLowerCase();
  if (!ownerMatchesTicket) {
    return res.status(400).json({ ok: false, error: "OWNER_MISMATCH" });
  }

  const chainIdFromPayload =
    typeof payload.chainId === "number"
      ? payload.chainId
      : Number(payload.chainId);
  const chainIdFromTicket = ticket.events?.contract?.chainId;

  if (
    Number.isFinite(chainIdFromPayload) &&
    chainIdFromPayload > 0 &&
    chainIdFromTicket &&
    Number(chainIdFromPayload) !== chainIdFromTicket
  ) {
    return res.status(400).json({ ok: false, error: "CHAIN_MISMATCH" });
  }

  const chainId =
    chainIdFromTicket ??
    (Number.isFinite(chainIdFromPayload) && chainIdFromPayload > 0
      ? Number(chainIdFromPayload)
      : undefined);

  if (!chainId) {
    return res.status(400).json({ ok: false, error: "CHAIN_ID_MISSING" });
  }

  const payloadTokenId =
    typeof payload.tokenId === "string" || typeof payload.tokenId === "number"
      ? String(payload.tokenId)
      : undefined;
  const tokenIdStr = ticket.tokenId.toString();

  if (payloadTokenId && payloadTokenId !== tokenIdStr) {
    return res.status(400).json({ ok: false, error: "TOKEN_MISMATCH" });
  }

  const amountFromPayload = Number(payload.amount);
  if (
    Number.isFinite(amountFromPayload) &&
    amountFromPayload > 0 &&
    Math.floor(amountFromPayload) !== ticket.amount
  ) {
    return res.status(400).json({ ok: false, error: "AMOUNT_MISMATCH" });
  }

  const burnAmount = ticket.amount;
  const rpcUrl = resolveRpcUrl(chainId);

  if (!rpcUrl) {
    return res
      .status(500)
      .json({ ok: false, error: "CHAIN_RPC_URL_MISSING_FOR_CHAIN" });
  }

  let balanceBefore = 0n;
  let balanceAfter = 0n;
  let burnTxHash: string | undefined;

  try {
    const provider = new JsonRpcProvider(rpcUrl, chainId);
    const bytecode = await provider.getCode(contractAddress);
    if (!bytecode || bytecode === "0x") {
      return res
        .status(400)
        .json({ ok: false, error: "ONCHAIN_CONTRACT_NOT_FOUND" });
    }

    const readContract = new Contract(
      contractAddress,
      BALANCE_OF_ABI,
      provider
    );
    const balance = await readContract.balanceOf(ownerWallet, tokenIdStr);
    balanceBefore = BigInt(balance.toString());

    if (balanceBefore < BigInt(burnAmount)) {
      return res
        .status(400)
        .json({ ok: false, error: "ONCHAIN_NOT_OWNED" });
    }

    const burnerPrivateKey = env.CHECKIN_BURNER_PRIVATE_KEY;
    if (!burnerPrivateKey) {
      return res
        .status(503)
        .json({ ok: false, error: "BURNER_NOT_CONFIGURED" });
    }

    const signer = new Wallet(burnerPrivateKey, provider);
    const writeContract = new Contract(
      contractAddress,
      BURN_TICKET_ABI,
      signer
    );
    const tx = await writeContract.burnTicket(
      ownerWallet,
      tokenIdStr,
      burnAmount
    );
    burnTxHash = tx?.hash;
    await tx.wait();

    const nextBalance = await writeContract.balanceOf(
      ownerWallet,
      tokenIdStr
    );
    balanceAfter = BigInt(nextBalance.toString());

    const expectedMax = balanceBefore - BigInt(burnAmount);
    if (balanceAfter > expectedMax) {
      return res
        .status(500)
        .json({ ok: false, error: "BURN_NOT_EFFECTIVE" });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // eslint-disable-next-line no-console
    console.error("On-chain verify/burn failed:", e);

    if (msg.includes("Not authorized to burn")) {
      return res
        .status(400)
        .json({ ok: false, error: "BURN_NOT_AUTHORIZED" });
    }
    if (msg.includes("amount must be greater than 1")) {
      return res
        .status(400)
        .json({ ok: false, error: "BURN_AMOUNT_RULE" });
    }

    return res.status(500).json({ ok: false, error: "ONCHAIN_VERIFY_FAILED" });
  }

  const updated = await prisma.tickets.update({
    where: { id: ticketId },
    data: { status: "CHECKED_IN", checkedInAt: new Date() },
    include: { events: { select: { name: true } } }
  });

  // Lookup user + seat (nếu có) để đưa vào thông báo và bell
  const user = await prisma.user.findFirst({
    where: {
      walletAddress: {
        equals: ownerWallet,
        mode: "insensitive"
      }
    },
    select: { id: true }
  });

  let seatCode: string | null = null;
  if (user) {
    const seatRow = await prisma.ticket_seats.findFirst({
      where: {
        userId: user.id,
        eventId: ticket.eventId,
        tokenId: ticket.tokenId
      },
      orderBy: { createdAt: "asc" }
    });
    seatCode = seatRow?.seatCode ?? null;
  }

  const prettyName = prettifyEventName(updated.events?.name);
  const ticketType = ticketTypeLabelByTokenId(tokenIdStr);

  // Gửi bell notification real-time cho người dùng (nếu tìm được user)
  if (user) {
    const noticeTitle =
      prettyName != null
        ? `Check-in thành công - ${prettyName}`
        : "Check-in thành công";
    const seatPart = seatCode ? ` Ghế của bạn là số ${seatCode}.` : "";

    const bell = await prisma.bell_notifications.create({
      data: {
        id: crypto.randomUUID(),
        userId: user.id,
        kind: "checkin",
        title: noticeTitle,
        message: `Vé loại ${ticketType} đã được check-in.${seatPart}`,
        meta: {
          ticketId: updated.id,
          eventName: prettyName,
          ticketType,
          seat: seatCode
        } as any
      }
    });

    notifyBell(
      user.id,
      jsonSafe({
        id: bell.id,
        kind: bell.kind,
        title: bell.title,
        message: bell.message,
        createdAt: bell.createdAt.toISOString(),
        readAt: bell.readAt ?? null
      })
    );
  }

  if (user) {
    await logActivity({
      req,
      userId: user.id,
      walletAddress: ownerWallet,
      action: "TICKET_CHECKIN",
      meta: {
        ticketId: updated.id,
        eventId: updated.eventId,
        eventName: updated.events?.name,
        chainId,
        contractAddress,
        ownerWallet,
        tokenId: tokenIdStr,
        burnedAmount: burnAmount,
        balanceBefore: balanceBefore.toString(),
        balanceAfter: balanceAfter.toString(),
        burnTxHash
      }
    });
  }

  const seatSentence = seatCode ? ` Ghế của bạn là số ${seatCode}.` : "";

  return res.status(200).json({
    ok: true,
    ticket: jsonSafe({
      id: updated.id,
      status: updated.status,
      checkedInAt: updated.checkedInAt,
      event: updated.events
    }),
    onchain: jsonSafe({
      chainId,
      contractAddress: contractAddress.toLowerCase(),
      ownerWallet: ownerWallet.toLowerCase(),
      tokenId: tokenIdStr,
      burnedAmount: burnAmount,
      balanceBefore: balanceBefore.toString(),
      balanceAfter: balanceAfter.toString(),
      burnTxHash
    }),
    welcome: jsonSafe({
      eventName: prettyName,
      ticketType,
      message: `Chào mừng bạn đến với sự kiện ${prettyName ?? "này"}.${seatSentence}`,
      seatingHint: seatingHintByTicketType(ticketType)
    })
  });
}

