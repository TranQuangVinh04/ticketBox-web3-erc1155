import { Router } from "express";
import { requireAuth, type AuthedRequest } from "../auth/middleware";
import { getMe } from "../controller/profile/me.c";
import { RequestHandler } from "express";
export const meRouter = Router();

/**
 * GET /api/me  (Authorization: Bearer <token>)
 */
meRouter.get("/me", requireAuth, getMe as unknown as RequestHandler)

