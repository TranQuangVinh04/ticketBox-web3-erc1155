import z from "zod";
import { getAddress, verifyMessage } from "ethers";
import { consumeNonce } from "../../utils/nonceStore";
import { signAccessToken } from "../../auth/jwt";
import { getPrisma } from "../../db/prisma";
import { Prisma } from "@prisma/client";
import { Request, Response } from "express";
import { jsonSafe } from "../../utils/json";
const VerifyBodySchema = z.object({
    address: z.string().min(1).optional(),
    chainId: z.coerce.number().int().positive().optional(),
    message: z.string().min(1),
    signature: z.string().min(1)
  });
  
  function extractNonceFromMessage(message: string) {
    // Accept both hex and UUID-ish nonces (frontend fallback may use randomUUID()).
    const m = message.match(/Nonce:\s*([^\s]+)/);
    return m?.[1];
  }
  
  function extractAddressFromMessage(message: string) {
    // Support both "Address: 0x..." and SIWE-like messages where the address is on its own line.
    const m1 = message.match(/Address:\s*(0x[a-fA-F0-9]{40})/);
    if (m1?.[1]) return m1[1];
    const m2 = message.match(/(0x[a-fA-F0-9]{40})/);
    return m2?.[1];
  }
  export async function verifySignMessage(req: Request, res: Response) {
    const { message, signature, address } = VerifyBodySchema.parse(req.body);
    
    const nonce = extractNonceFromMessage(message);
    
    if (!nonce) return res.status(400).json({ ok: false, error: "NONCE_NOT_FOUND_IN_MESSAGE" });
    let randomName = Math.random().toString(36).substring(2, 15);
    let recovered: string;
    try {
      recovered = getAddress(verifyMessage(message, signature));
    } catch {
      return res.status(401).json({ ok: false, error: "BAD_SIGNATURE" });
    }
  
    const msgAddr = extractAddressFromMessage(message);
    if (msgAddr && getAddress(msgAddr) !== recovered) {
      return res.status(401).json({ ok: false, error: "MESSAGE_ADDRESS_MISMATCH" });
    }
  
    // If frontend sent address explicitly, enforce it matches the recovered signer.
    if (address && getAddress(address) !== recovered) {
      return res.status(401).json({ ok: false, error: "ADDRESS_MISMATCH" });
    }
  
    const consumed = consumeNonce(recovered, nonce);
    if (!consumed.ok) return res.status(401).json({ ok: false, error: "NONCE_INVALID_OR_EXPIRED" });
  
    // Create user if not exists (Prisma)
    try {
      const prisma = getPrisma();
      const user = await prisma.user.upsert({
        where: { walletAddress: recovered },
        update: { lastLoginAt: new Date() } as any,
        create: { walletAddress: recovered, name: "User"+"_"+randomName, lastLoginAt: new Date() } as any,
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
  
      
    
  
    const token = signAccessToken(recovered);
    return res.json({ ok: true, token, user: jsonSafe(user) });
  } catch (e) {
    console.error(e);
    if (e instanceof Prisma.PrismaClientInitializationError) {
      // Includes: missing DATABASE_URL, wrong credentials (P1000), cannot reach DB, etc.
      if (String(e.message).includes("Authentication failed")) {
        return res.status(500).json({ ok: false, error: "DB_AUTH_FAILED" });
      }
      if (String(e.message).includes("does not exist")) {
        return res.status(500).json({ ok: false, error: "DB_NOT_FOUND" });
      }
      return res.status(500).json({ ok: false, error: "DB_INIT_FAILED" });
    }
    return res.status(500).json({ ok: false, error: "DB_ERROR" });
  }
  }