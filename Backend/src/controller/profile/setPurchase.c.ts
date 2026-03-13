import z from "zod";
import { getAddress } from "ethers";
import type { Response } from "express";
import type { AuthedRequest } from "../../auth/middleware";
import { getPrisma } from "../../db/prisma";
import { jsonSafe } from "../../utils/json";

const SetPurchaseBodySchema = z.object({
  chainId: z.coerce.number().int().positive(),
  contractAddress: z.string().min(1),
  quantity: z.coerce.number().int().positive().default(1),
});

export async function setPurchase(req: AuthedRequest, res: Response) {
  const wallet = req.wallet;
  if (!wallet) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });

  const { chainId, contractAddress, quantity } = SetPurchaseBodySchema.parse(req.body);
  
  const prisma = getPrisma();

  const buyer = getAddress(wallet);
  const contractAddr = getAddress(contractAddress);

  const user = await prisma.user.findUnique({
    where: { walletAddress: buyer },
    select: {
      id: true,
    },
  });

  if (!user) return res.status(404).json({ ok: false, error: "USER_NOT_FOUND" });

  const contract = await prisma.contract.findFirst({
    where: { address: contractAddr } ,
    
  });

  if (!contract) return res.status(404).json({ ok: false, error: "CONTRACT_NOT_FOUND" });

  const event = await prisma.event.findFirst({
    where: { contractId: contract.id },
    
  });

  if (!event) return res.status(404).json({ ok: false, error: "EVENT_NOT_FOUND" });
  
  

 
  // Upsert purchase row and increment quantity for repeat buys
  const purchase = await prisma.eventPurchase.upsert({
    where: { userId_eventId: { userId: user.id, eventId: event.id } },
    create: { userId: user.id, eventId: event.id, quantity },
    update: { quantity: { increment: quantity } },
  });

  return res.json(
    jsonSafe({
      ok: true,
      message: "SET_PURCHASE_SUCCESS",
      purchase: {
        id: purchase.id,
        quantity: purchase.quantity,
        event: { id: event.id, tokenId: event.tokenId, name: event.name },
        contract: { id: contract.id }
      }
    })
  );
}