import { randomBytes } from "node:crypto";
import { getAddress } from "ethers";

export type NonceRecord = {
  address: string;
  nonce: string;
  expiresAt: Date;
  usedAt?: Date;
};

// In-memory store for quick testing (replace with Redis/DB later)
const store = new Map<string, NonceRecord[]>(); // key = checksum address

export function createNonce(address: string, ttlMs = 10 * 60 * 1000): NonceRecord {
  const addr = getAddress(address);
  const nonce = randomBytes(16).toString("hex");
  const rec: NonceRecord = { address: addr, nonce, expiresAt: new Date(Date.now() + ttlMs) };
  const list = store.get(addr) ?? [];
  list.push(rec);
  store.set(addr, list);
  return rec;
}

export function consumeNonce(address: string, nonce: string): { ok: true; rec: NonceRecord } | { ok: false } {
  const addr = getAddress(address);
  const list = store.get(addr) ?? [];
  const now = Date.now();

  // Find newest valid nonce
  for (let i = list.length - 1; i >= 0; i--) {
    const rec = list[i]!;
    if (rec.nonce !== nonce) continue;
    if (rec.usedAt) return { ok: false };
    if (rec.expiresAt.getTime() <= now) return { ok: false };
    rec.usedAt = new Date();
    return { ok: true, rec };
  }
  return { ok: false };
}

