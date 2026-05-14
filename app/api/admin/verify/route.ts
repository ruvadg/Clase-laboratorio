import { NextResponse, type NextRequest } from "next/server";
import { verifyAdminPassword } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: { password?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  if (!verifyAdminPassword(body.password)) {
    return NextResponse.json({ error: "Contraseña incorrecta." }, { status: 401 });
  }
  return NextResponse.json({ ok: true });
}
