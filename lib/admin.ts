const DEFAULT_PASSWORD = "RuvaBase123!";

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function verifyAdminPassword(provided: unknown): boolean {
  if (typeof provided !== "string") return false;
  const expected = process.env.ADMIN_PASSWORD || DEFAULT_PASSWORD;
  return timingSafeEqual(provided, expected);
}
