import { NextResponse, type NextRequest } from "next/server";
import { voteFor } from "@/lib/storage";
import { getIdentityHash } from "@/lib/ip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const identity = getIdentityHash(req);
  const result = await voteFor(params.id, identity);
  if (!result.ok) {
    if (result.reason === "already-voted") {
      return NextResponse.json(
        { error: "Ya votaste. Solo se permite un voto por persona." },
        { status: 409 },
      );
    }
    if (result.reason === "closed") {
      return NextResponse.json(
        { error: "La votación está cerrada." },
        { status: 423 },
      );
    }
    return NextResponse.json({ error: "Propuesta no encontrada." }, { status: 404 });
  }
  return NextResponse.json({ proposal: result.proposal });
}
