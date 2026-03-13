import type { Response } from "express";
import { getPrisma } from "../../db/prisma";
import { jsonSafe } from "../../utils/json";
import type { AuthedRequest } from "../../auth/middleware";

export async function getMe(req: AuthedRequest, res: Response): Promise<any> {
    const address = req.wallet;
    if (!address) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
    const prisma = getPrisma();
      const user = await prisma.user.findUnique({
        where: { walletAddress: address },
        include: {
          purchases: {
            select: {
              id: true,
              event: {
                select: {
                  id: true,
                  contract: {
                    select: {
                      address: true,
                      chainId: true
                    }
                  }
                }
              }
            }
          }
        }
        
      });
    return res.status(200).json({ ok: true, user: jsonSafe(user) });
}
