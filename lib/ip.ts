import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";

const HASH_SALT = "masterlab-clase-laboratorio";

export function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return "0.0.0.0";
}

export function hashIdentity(ip: string): string {
  return createHash("sha256").update(`${HASH_SALT}:${ip}`).digest("hex").slice(0, 24);
}

export function getIdentityHash(req: NextRequest): string {
  return hashIdentity(getClientIp(req));
}
