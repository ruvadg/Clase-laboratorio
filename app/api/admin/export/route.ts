import { NextResponse, type NextRequest } from "next/server";
import { getLabState, listProposals } from "@/lib/storage";
import { verifyAdminPassword } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function csvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

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

  const [proposals, state] = await Promise.all([listProposals(), getLabState()]);
  const total = proposals.reduce((acc, p) => acc + p.votes, 0);
  const winnerId = state.status === "closed" ? state.winnerId : null;

  const header = [
    "rank",
    "votos",
    "porcentaje",
    "titulo",
    "autor",
    "descripcion",
    "creado_en",
    "es_ganadora",
  ];
  const rows = proposals.map((p, idx) => {
    const share = total > 0 ? Math.round((p.votes / total) * 1000) / 10 : 0;
    return [
      String(idx + 1),
      String(p.votes),
      `${share}%`,
      p.title,
      p.authorName,
      p.description.replace(/\r?\n/g, " "),
      new Date(p.createdAt).toISOString(),
      p.id === winnerId ? "sí" : "no",
    ].map(csvCell).join(",");
  });

  const csv = "﻿" + [header.join(","), ...rows].join("\n") + "\n";
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="masterlab-laboratorio-${stamp}.csv"`,
      "cache-control": "no-store",
    },
  });
}
