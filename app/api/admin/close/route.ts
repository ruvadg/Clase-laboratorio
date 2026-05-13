import { NextResponse, type NextRequest } from "next/server";
import { closeVoting, reopenVoting } from "@/lib/storage";
import { verifyAdminPassword } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: { password?: unknown; action?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  if (!verifyAdminPassword(body.password)) {
    return NextResponse.json({ error: "Contraseña incorrecta." }, { status: 401 });
  }
  if (body.action === "reopen") {
    const state = await reopenVoting();
    return NextResponse.json({ state, winner: null });
  }
  const result = await closeVoting();
  return NextResponse.json(result);
}
