import { Router } from "express";
import type { RequestHandler } from "express";
import { requireAuth } from "../auth/middleware";
import { setPurchase } from "../controller/profile/setPurchase.c";

export const setPurchaseRouter = Router();

/**
 * POST /purchase  (Authorization: Bearer <token>)
 * body: { chainId, contractAddress, tokenId, quantity }
 */
setPurchaseRouter.post("/setpurchase",requireAuth, setPurchase as unknown as RequestHandler);

