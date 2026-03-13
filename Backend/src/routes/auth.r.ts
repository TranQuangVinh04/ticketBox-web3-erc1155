import { Router } from "express";
import { getNonce } from "../controller/auth/getNonce.c";
import { verifySignMessage } from "../controller/auth/verifySignMessage.c";
import { RequestHandler } from "express";
export const authRouter = Router();




/**
 * GET /api/auth/wallet/nonce?address=0x...
 */
authRouter.get("/auth/wallet/nonce",getNonce as RequestHandler);



/**
 * POST /api/auth/wallet/verify
 * body: { address?, chainId?, message, signature }
 */
authRouter.post("/auth/wallet/verify",verifySignMessage as RequestHandler);

