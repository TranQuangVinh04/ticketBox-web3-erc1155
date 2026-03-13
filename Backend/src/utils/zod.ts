import z from "zod";
export const NonceQuerySchema = z.object({
    address: z.string().min(1),
    chainId: z.coerce.number().int().positive().optional()
  });
  export const VerifyBodySchema = z.object({
    address: z.string().min(1).optional(),
    chainId: z.coerce.number().int().positive().optional(),
    message: z.string().min(1),
    signature: z.string().min(1)
  }); 
  export const MeBodySchema = z.object({
    address: z.string().min(1),
  });