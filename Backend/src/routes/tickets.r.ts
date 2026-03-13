import { Router, type RequestHandler } from "express";

import { requireAuth } from "../auth/middleware";
import { issueTicket } from "../controller/tickets/issue.c";
import { checkin } from "../controller/tickets/checkin.c";

export const ticketsRouter = Router();

ticketsRouter.post(
  "/tickets/issue",
  requireAuth,
  issueTicket as unknown as RequestHandler
);

ticketsRouter.post(
  "/checkin",
  checkin as unknown as RequestHandler
);

