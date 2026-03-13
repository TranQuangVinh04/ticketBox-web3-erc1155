import { Router, type RequestHandler } from "express";

import { requireAuth, requireStaffOrOwner } from "../auth/middleware";
import { analyticsOverviewHandler } from "../controller/admin/analytics.c";

export const adminRouter = Router();

adminRouter.get(
  "/admin/analytics/overview",
  requireAuth,
  requireStaffOrOwner as unknown as RequestHandler,
  analyticsOverviewHandler as unknown as RequestHandler
);

