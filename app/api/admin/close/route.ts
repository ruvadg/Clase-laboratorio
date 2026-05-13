import { NextResponse, type NextRequest } from "next/server";
import { closeVoting, reopenVoting, scheduleClose } from "@/lib/storage";
import { verifyAdminPassword } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_DURATION_MS = 1000 * 60 * 60 * 24 * 30; // 30 días

export async function POST(req: NextRequest) {
  let body: { password?: unknown; action?: unknown; durationMs?: unknown };
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
  if (body.action === "schedule") {
    const duration = Number(body.durationMs);
    if (!Number.isFinite(duration) || duration <= 0) {
      return NextResponse.json(
        { error: "Duración inválida." },
        { status: 400 },
      );
    }
    if (duration > MAX_DURATION_MS) {
      return NextResponse.json(
        { error: "Máximo 30 días." },
        { status: 400 },
      );
    }
    const deadline = Date.now() + duration;
    const state = await scheduleClose(deadline);
    return NextResponse.json({ state, winner: null });
  }
  const result = await closeVoting();
  return NextResponse.json(result);
}
