import { createNonce } from "../../utils/nonceStore";
import { Request, Response } from "express"; 
import { NonceQuerySchema } from "../../utils/zod";


function buildSignInMessage(params: { address: string; chainId: number; nonce: string }) {
    const issuedAt = new Date().toISOString();
    return [
      "Zeo wants you to sign in with your Ethereum account:",
      params.address,
      "",
      "Sign in to Zeo.",
      "",
      `Chain ID: ${params.chainId}`,
      `Nonce: ${params.nonce}`,
      `Issued At: ${issuedAt}`
    ].join("\n");
  }
export async function getNonce(req: Request, res: Response) {
    const { address, chainId } = NonceQuerySchema.parse(req.query);
   
    const rec = createNonce(address);
  
    console.log("checking nonce", rec);
    // Default to 1 if chainId not provided; frontend sends it, but keep backward compatibility.
    const msg = buildSignInMessage({ address: rec.address, chainId: chainId ?? 1, nonce: rec.nonce });
  
    res.json({ address: rec.address, nonce: rec.nonce, message: msg, expiresAt: rec.expiresAt });
  }