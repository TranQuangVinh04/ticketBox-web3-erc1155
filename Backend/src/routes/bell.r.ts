import { Router, type RequestHandler } from "express";

import { requireAuth } from "../auth/middleware";
import { listBell } from "../controller/bell/list.c";
import { markAllBellRead, markBellRead } from "../controller/bell/read.c";
import { bellStream } from "../controller/bell/stream.c";

export const bellRouter = Router();

bellRouter.get(
  "/bell",
  requireAuth,
  listBell as unknown as RequestHandler
);

bellRouter.post(
  "/bell/:id/read",
  requireAuth,
  markBellRead as unknown as RequestHandler
);

bellRouter.post(
  "/bell/read-all",
  requireAuth,
  markAllBellRead as unknown as RequestHandler
);

// SSE stream; auth via ?token=...
bellRouter.get(
  "/bell/stream",
  bellStream as unknown as RequestHandler
);

