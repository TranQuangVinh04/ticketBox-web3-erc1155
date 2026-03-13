import type { Response } from "express";

import type { AuthedRequest } from "../../auth/middleware";
import { getPrisma } from "../../db/prisma";
import { verifyAccessToken } from "../../auth/jwt";

// In-memory subscribers; for a single-node dev setup this is fine.
type BellSubscriber = {
  userId: string;
  send: (payload: unknown) => void;
};

const subscribers = new Set<BellSubscriber>();

export function notifyBell(userId: string, payload: unknown) {
  for (const sub of subscribers) {
    if (sub.userId === userId) {
      sub.send(payload);
    }
  }
}

export async function bellStream(req: AuthedRequest, res: Response) {
  // Frontend passes token as query param for EventSource.
  const token = typeof req.query.token === "string" ? req.query.token : undefined;
  if (!token) {
    return res.status(401).json({ ok: false, error: "MISSING_TOKEN" });
  }

  let wallet: string;
  try {
    const payload = verifyAccessToken(token);
    wallet = payload.wallet;
  } catch {
    return res.status(401).json({ ok: false, error: "BAD_TOKEN" });
  }

  const prisma = getPrisma();
  const user = await prisma.user.findFirst({
    where: {
      walletAddress: {
        equals: wallet,
        mode: "insensitive"
      }
    },
    select: { id: true }
  });

  if (!user) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });

  // Set up SSE headers
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const subscriber: BellSubscriber = {
    userId: user.id,
    send: (payload: unknown) => send("bell", payload)
  };

  subscribers.add(subscriber);

  // Signal ready so frontend can show "connected"
  send("ready", { ok: true });

  // Clean up on disconnect
  req.on("close", () => {
    subscribers.delete(subscriber);
  });
}

