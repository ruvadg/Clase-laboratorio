"use client";

import { useEffect, useMemo, useState } from "react";
import type { Proposal } from "@/lib/types";

const CONFETTI_COLORS = ["#1E1EFF", "#0A0A23", "#7C7CFF", "#A5A5FF", "#1E1EFF"];

type ConfettiPiece = {
  id: number;
  left: string;
  delay: string;
  duration: string;
  x: string;
  rot: string;
  color: string;
  size: number;
  shape: "square" | "circle" | "bar";
};

function makeConfetti(count: number): ConfettiPiece[] {
  const pieces: ConfettiPiece[] = [];
  for (let i = 0; i < count; i++) {
    const drift = (Math.random() - 0.5) * 40;
    pieces.push({
      id: i,
      left: `${Math.random() * 100}%`,
      delay: `${Math.random() * 0.8}s`,
      duration: `${3 + Math.random() * 2.5}s`,
      x: `${drift}vw`,
      rot: `${360 + Math.random() * 720}deg`,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      size: 6 + Math.random() * 8,
      shape: (["square", "circle", "bar"] as const)[i % 3],
    });
  }
  return pieces;
}

export function WinnerBanner({
  winner,
  totalVotes,
}: {
  winner: Proposal;
  totalVotes: number;
}) {
  const confetti = useMemo(() => makeConfetti(48), []);
  const [showConfetti, setShowConfetti] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setShowConfetti(false), 6500);
    return () => clearTimeout(t);
  }, []);

  const share =
    totalVotes > 0 ? Math.round((winner.votes / totalVotes) * 100) : 100;

  return (
    <div className="relative">
      {showConfetti && (
        <div
          className="pointer-events-none absolute inset-x-0 -top-4 z-10 h-[120vh] overflow-hidden"
          aria-hidden
        >
          {confetti.map((c) => (
            <span
              key={c.id}
              className="animate-confetti absolute top-0 block"
              style={
                {
                  left: c.left,
                  width: c.size,
                  height: c.shape === "bar" ? c.size * 0.35 : c.size,
                  background: c.color,
                  borderRadius: c.shape === "circle" ? "9999px" : c.shape === "bar" ? "2px" : "2px",
                  ["--confetti-delay" as string]: c.delay,
                  ["--confetti-duration" as string]: c.duration,
                  ["--confetti-x" as string]: c.x,
                  ["--confetti-rot" as string]: c.rot,
                } as React.CSSProperties
              }
            />
          ))}
        </div>
      )}

      <section
        className="animate-winner-rise animate-winner-glow relative overflow-hidden rounded-3xl border border-masterlab-blue/30 bg-gradient-to-br from-white via-white to-masterlab-mist p-8 sm:p-10"
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-60"
          aria-hidden
        >
          <div className="animate-winner-shine absolute -inset-y-12 left-0 w-1/2 -skew-x-12 bg-gradient-to-r from-transparent via-white/70 to-transparent" />
        </div>
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 animate-winner-orbit" aria-hidden>
          <div className="absolute left-1/2 top-0 h-3 w-3 -translate-x-1/2 rounded-full bg-masterlab-blue/60 blur-[1px]" />
          <div className="absolute bottom-0 right-0 h-2 w-2 rounded-full bg-masterlab-blue/40" />
          <div className="absolute left-0 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-masterlab-ink/30" />
        </div>

        <div className="relative">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-masterlab-blue px-3 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-white">
              <Trophy /> Clase ganadora
            </span>
            <span className="rounded-full border border-masterlab-line bg-white/80 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-masterlab-ink/60">
              Votación cerrada
            </span>
          </div>

          <h2 className="mt-4 font-display text-3xl font-semibold leading-tight tracking-tight text-masterlab-ink sm:text-4xl">
            {winner.title}
          </h2>

          <p className="mt-2 text-sm text-masterlab-ink/70">
            Propuesta por{" "}
            <span className="font-semibold text-masterlab-ink">{winner.authorName}</span>
          </p>

          {winner.description && (
            <p className="mt-4 max-w-2xl whitespace-pre-wrap text-sm text-masterlab-ink/70 sm:text-base">
              {winner.description}
            </p>
          )}

          <div className="mt-6 grid grid-cols-2 gap-3 sm:max-w-md sm:grid-cols-3">
            <Stat label="Votos" value={`${winner.votes}`} />
            <Stat label="Apoyo" value={`${share}%`} />
            <Stat label="Estado" value="Ganadora" highlight />
          </div>

          <p className="mt-6 max-w-2xl text-sm text-masterlab-ink/60">
            Esta es la clase que construiremos juntos en el próximo laboratorio
            de MasterLab IA.
          </p>
        </div>
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border px-3 py-2 ${
        highlight
          ? "border-masterlab-blue/40 bg-masterlab-blue/10 text-masterlab-blue"
          : "border-masterlab-line bg-white/80 text-masterlab-ink"
      }`}
    >
      <div className="font-mono text-[10px] uppercase tracking-widest opacity-60">
        {label}
      </div>
      <div className="mt-0.5 font-display text-lg font-semibold tabular-nums">
        {value}
      </div>
    </div>
  );
}

function Trophy() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M7 4h10v3a5 5 0 11-10 0V4z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M5 5H3v2a3 3 0 003 3M19 5h2v2a3 3 0 01-3 3M10 14h4v3h2v3H8v-3h2v-3z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}
