import { Router } from "express";
import { prisma } from "../db/prisma";
import { jsonSafe } from "../utils/json";
export const routerGetEvent = Router();

routerGetEvent.get("/getAllEvent",async (req, res) => {
   
    const events = await prisma.event.findMany({
        include: {
            contract: true
        }
    });
    return res.json({ events: jsonSafe(events) });
});



