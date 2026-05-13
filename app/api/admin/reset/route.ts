import { NextResponse, type NextRequest } from "next/server";
import { resetAll } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_PASSWORD = "RuvaBase123!";

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function POST(req: NextRequest) {
  let body: { password?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const provided = typeof body.password === "string" ? body.password : "";
  const expected = process.env.ADMIN_PASSWORD || DEFAULT_PASSWORD;
  if (!timingSafeEqual(provided, expected)) {
    return NextResponse.json({ error: "Contraseña incorrecta." }, { status: 401 });
  }
  await resetAll();
  return NextResponse.json({ ok: true });
}
