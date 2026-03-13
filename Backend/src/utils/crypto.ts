import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export function randomNonce(bytes = 16): string {
  return randomBytes(bytes).toString("hex");
}

export function signQrPayload<T>(secret: string, payload: T): { data: string; sig: string } {
  const data = JSON.stringify(payload);
  const sig = createHmac("sha256", secret).update(data).digest("hex");
  return { data, sig };
}

export function verifyQrPayload(secret: string, data: string, sig: string): boolean {
  const expected = createHmac("sha256", secret).update(data).digest("hex");
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(sig, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

