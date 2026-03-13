import { Router } from "express";
import type { RequestHandler } from "express";

import { requireAuth } from "../auth/middleware";
import { getTakenSeatsHandler, setPurchase } from "../controller/profile/setPurchase.c";

export const setPurchaseRouter = Router();

/**
 * POST /setpurchase  (Authorization: Bearer <token>)
 * body: { chainId, contractAddress, tokenId, quantity, seat, ownerWallet }
 */
setPurchaseRouter.post(
  "/setpurchase",
  requireAuth,
  setPurchase as unknown as RequestHandler
);

/**
 * GET /setpurchase/seats?chainId=&contractAddress=&tokenId=
 * Public endpoint: trả về danh sách ghế đã được đặt.
 */
setPurchaseRouter.get(
  "/setpurchase/seats",
  getTakenSeatsHandler as unknown as RequestHandler
);

