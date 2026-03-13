import express from "express";
import cors from "cors";
import helmet from "helmet";
import { ZodError } from "zod";

import { authRouter } from "./routes/auth.r";
import { meRouter } from "./routes/me.r";
import { routerGetEvent } from "./routes/getEvent";
  import { setPurchaseRouter } from "./routes/setPurchase";
  export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

  // Support both "/auth/..." and "/api/auth/..." so frontends can choose either base URL.

  app.use(authRouter);
  app.use(meRouter);
  app.use(routerGetEvent);
  app.use(setPurchaseRouter);

  app.use("/api", authRouter);
  app.use("/api", meRouter);
  app.use("/api", routerGetEvent);
  app.use("/api", setPurchaseRouter);

  app.use((_req, res) => res.status(404).json({ ok: false, error: "NOT_FOUND" }));

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err instanceof ZodError) {
      return res.status(400).json({ ok: false, error: "VALIDATION_ERROR", issues: err.issues });
    }
    // eslint-disable-next-line no-console
    console.error(err);
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  });

  return app;
}

