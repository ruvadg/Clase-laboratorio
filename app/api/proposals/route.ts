import { NextResponse, type NextRequest } from "next/server";
import {
  createProposal,
  getLabStateWithAutoClose,
  getMyProposalId,
  getMyVotedId,
  listProposals,
} from "@/lib/storage";
import { getIdentityHash } from "@/lib/ip";
import type { ProposalWithVoteState } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_NAME = 60;
const MAX_TITLE = 120;
const MAX_DESCRIPTION = 600;

export async function GET(req: NextRequest) {
  const identity = getIdentityHash(req);
  const state = await getLabStateWithAutoClose();
  const [proposals, myProposalId, myVoteId] = await Promise.all([
    listProposals(),
    getMyProposalId(identity),
    getMyVotedId(identity),
  ]);
  const enriched: ProposalWithVoteState[] = proposals.map((p) => ({
    ...p,
    votedByMe: myVoteId === p.id,
    mineToEdit: myProposalId === p.id,
  }));
  return NextResponse.json({
    proposals: enriched,
    hasProposed: Boolean(myProposalId),
    hasVoted: Boolean(myVoteId),
    state,
  });
}

export async function POST(req: NextRequest) {
  let body: { title?: unknown; description?: unknown; authorName?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const authorName = typeof body.authorName === "string" ? body.authorName.trim() : "";

  if (authorName.length < 2) {
    return NextResponse.json(
      { error: "Pon tu nombre (mínimo 2 caracteres)." },
      { status: 400 },
    );
  }
  if (authorName.length > MAX_NAME) {
    return NextResponse.json(
      { error: `El nombre no puede superar ${MAX_NAME} caracteres.` },
      { status: 400 },
    );
  }
  if (title.length < 3) {
    return NextResponse.json(
      { error: "El título debe tener al menos 3 caracteres." },
      { status: 400 },
    );
  }
  if (title.length > MAX_TITLE) {
    return NextResponse.json(
      { error: `El título no puede superar ${MAX_TITLE} caracteres.` },
      { status: 400 },
    );
  }
  if (description.length > MAX_DESCRIPTION) {
    return NextResponse.json(
      { error: `La descripción no puede superar ${MAX_DESCRIPTION} caracteres.` },
      { status: 400 },
    );
  }

  const identity = getIdentityHash(req);
  const result = await createProposal({
    title,
    description,
    authorName,
    authorHash: identity,
  });
  if (!result.ok) {
    if (result.reason === "closed") {
      return NextResponse.json(
        { error: "La votación está cerrada." },
        { status: 423 },
      );
    }
    return NextResponse.json(
      { error: "Ya enviaste una propuesta desde este dispositivo." },
      { status: 409 },
    );
  }
  return NextResponse.json({ proposal: result.proposal }, { status: 201 });
}
