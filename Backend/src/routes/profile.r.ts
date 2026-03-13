import { Router } from "express";
import type { RequestHandler } from "express";
import { requireAuth } from "../auth/middleware";
import { setPurchase } from "../controller/profile/setPurchase.c";

export const profileRouter = Router();

/**
 * POST /purchase  (Authorization: Bearer <token>)
 * body: { chainId, contractAddress, tokenId, quantity }
 */
profileRouter.post("/purchase", requireAuth, setPurchase as unknown as RequestHandler);

