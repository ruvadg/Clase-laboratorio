"use client";

import { useEffect, useMemo, useState } from "react";

function format(ms: number): { d: number; h: number; m: number; s: number } {
  const clamped = Math.max(0, ms);
  const totalSeconds = Math.floor(clamped / 1000);
  return {
    d: Math.floor(totalSeconds / 86400),
    h: Math.floor((totalSeconds % 86400) / 3600),
    m: Math.floor((totalSeconds % 3600) / 60),
    s: totalSeconds % 60,
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

export function Countdown({
  deadline,
  onExpire,
  variant = "default",
}: {
  deadline: number;
  onExpire?: () => void;
  variant?: "default" | "compact";
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const remaining = deadline - now;
  const { d, h, m, s } = useMemo(() => format(remaining), [remaining]);
  const expired = remaining <= 0;

  useEffect(() => {
    if (expired && onExpire) onExpire();
  }, [expired, onExpire]);

  if (variant === "compact") {
    return (
      <span className="inline-flex items-center gap-1 font-mono text-xs tabular-nums text-masterlab-ink">
        <Dot expired={expired} />
        {expired
          ? "Cerrando..."
          : d > 0
            ? `${d}d ${pad(h)}:${pad(m)}:${pad(s)}`
            : `${pad(h)}:${pad(m)}:${pad(s)}`}
      </span>
    );
  }

  return (
    <div className="inline-flex items-center gap-3 rounded-2xl border border-masterlab-line bg-white px-4 py-3 shadow-soft">
      <Dot expired={expired} />
      <div>
        <div className="font-mono text-[10px] uppercase tracking-widest text-masterlab-ink/50">
          {expired ? "La votación se está cerrando" : "Cierra en"}
        </div>
        <div className="mt-0.5 flex items-baseline gap-2 font-display text-2xl font-semibold tabular-nums text-masterlab-ink">
          {d > 0 && (
            <span>
              {d}
              <span className="ml-0.5 text-xs font-medium text-masterlab-ink/50">d</span>
            </span>
          )}
          <span>
            {pad(h)}
            <span className="text-masterlab-ink/30">:</span>
            {pad(m)}
            <span className="text-masterlab-ink/30">:</span>
            {pad(s)}
          </span>
        </div>
      </div>
    </div>
  );
}

function Dot({ expired }: { expired: boolean }) {
  return (
    <span
      className={`relative inline-flex h-2.5 w-2.5 ${
        expired ? "text-red-500" : "text-masterlab-blue"
      }`}
      aria-hidden
    >
      <span className="absolute inset-0 animate-ping rounded-full bg-current opacity-60" />
      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-current" />
    </span>
  );
}
