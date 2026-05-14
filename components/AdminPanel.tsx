"use client";

import { useCallback, useEffect, useState } from "react";
import type { LabState, ProposalWithVoteState } from "@/lib/types";
import { Countdown } from "./Countdown";

type ApiList = {
  proposals: ProposalWithVoteState[];
  state: LabState;
};

type Action = "close" | "schedule" | "reopen" | "reset" | "export";

const PRESETS: { label: string; ms: number }[] = [
  { label: "5 min", ms: 5 * 60_000 },
  { label: "15 min", ms: 15 * 60_000 },
  { label: "30 min", ms: 30 * 60_000 },
  { label: "1 h", ms: 60 * 60_000 },
  { label: "4 h", ms: 4 * 60 * 60_000 },
  { label: "24 h", ms: 24 * 60 * 60_000 },
  { label: "7 d", ms: 7 * 24 * 60 * 60_000 },
];

const POLL_INTERVAL_MS = 6000;
const SESSION_KEY = "masterlab-admin-session";

export function AdminPanel() {
  const [unlocked, setUnlocked] = useState(false);
  const [verifiedPassword, setVerifiedPassword] = useState("");
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.sessionStorage.getItem(SESSION_KEY);
    if (!stored) {
      setCheckingSession(false);
      return;
    }
    let cancelled = false;
    fetch("/api/admin/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: stored }),
    })
      .then((res) => {
        if (cancelled) return;
        if (res.ok) {
          setVerifiedPassword(stored);
          setUnlocked(true);
        } else {
          window.sessionStorage.removeItem(SESSION_KEY);
        }
      })
      .catch(() => {
        /* ignore */
      })
      .finally(() => {
        if (!cancelled) setCheckingSession(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function lock() {
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(SESSION_KEY);
    }
    setUnlocked(false);
    setVerifiedPassword("");
  }

  function unlock(password: string) {
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(SESSION_KEY, password);
    }
    setVerifiedPassword(password);
    setUnlocked(true);
  }

  if (checkingSession) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-masterlab-line bg-white p-6 shadow-soft">
        <div className="h-32 animate-pulse rounded-xl bg-masterlab-mist/60" />
      </div>
    );
  }

  if (!unlocked) {
    return <LockScreen onUnlock={unlock} />;
  }

  return <AdminPanelUnlocked password={verifiedPassword} onLock={lock} />;
}

function LockScreen({ onUnlock }: { onUnlock: (password: string) => void }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    if (!password) {
      setError("Introduce la contraseña.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "Contraseña incorrecta.");
        return;
      }
      onUnlock(password);
    } catch {
      setError("Error de red. Intenta de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <div className="rounded-2xl border border-masterlab-line bg-white p-7 shadow-soft sm:p-8">
        <div className="flex items-center gap-3">
          <LockIcon />
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-masterlab-blue">
            / panel restringido
          </p>
        </div>
        <h1 className="mt-3 font-display text-2xl font-semibold text-masterlab-ink">
          Acceso solo para administradores
        </h1>
        <p className="mt-2 text-sm text-masterlab-ink/60">
          Introduce la contraseña para entrar al control del laboratorio.
        </p>

        <form onSubmit={submit} className="mt-5 space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-masterlab-ink/60">
              Contraseña
            </span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
              autoFocus
              placeholder="••••••••••"
              className="w-full rounded-lg border border-masterlab-line bg-white px-3 py-2.5 text-sm text-masterlab-ink outline-none transition placeholder:text-masterlab-ink/40 focus:border-masterlab-blue focus:shadow-ring"
            />
          </label>

          <button
            type="submit"
            disabled={busy || !password}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-masterlab-blue px-4 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:brightness-110 disabled:cursor-not-allowed disabled:bg-masterlab-ink/15 disabled:text-masterlab-ink/40"
          >
            {busy ? "Verificando..." : "Entrar"}
          </button>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          )}
        </form>

        <p className="mt-5 text-[11px] text-masterlab-ink/40">
          Esta página es privada. Los alumnos no necesitan entrar aquí.
        </p>
      </div>
    </div>
  );
}

function LockIcon() {
  return (
    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-masterlab-blue/10 text-masterlab-blue">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
        <rect
          x="4"
          y="11"
          width="16"
          height="10"
          rx="2"
          stroke="currentColor"
          strokeWidth="2"
        />
        <path
          d="M8 11V8a4 4 0 018 0v3"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

function AdminPanelUnlocked({
  password,
  onLock,
}: {
  password: string;
  onLock: () => void;
}) {
  const [data, setData] = useState<ApiList | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingAction, setPendingAction] = useState<null | Action>(null);
  const [pendingDurationMs, setPendingDurationMs] = useState<number | null>(null);
  const [busy, setBusy] = useState<null | Action>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/proposals", { cache: "no-store" });
      const d = (await res.json()) as ApiList;
      setData(d);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  function requireConfirm(action: Action, durationMs?: number) {
    setError(null);
    setSuccess(null);
    if (!password) {
      setError("Introduce la contraseña.");
      return;
    }
    setPendingAction(action);
    setPendingDurationMs(durationMs ?? null);
  }

  async function runAction(action: Action, durationMs?: number) {
    setError(null);
    setSuccess(null);
    setBusy(action);
    try {
      if (action === "export") {
        const res = await fetch("/api/admin/export", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ password }),
        });
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          setError(errBody?.error ?? "No pudimos exportar.");
          return;
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `masterlab-laboratorio-${new Date()
          .toISOString()
          .replace(/[:.]/g, "-")
          .slice(0, 19)}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        setSuccess("CSV descargado.");
        return;
      }

      const endpoint =
        action === "reset" ? "/api/admin/reset" : "/api/admin/close";
      let body: Record<string, unknown>;
      if (action === "reset") {
        body = { password };
      } else if (action === "reopen") {
        body = { password, action: "reopen" };
      } else if (action === "schedule") {
        body = { password, action: "schedule", durationMs };
      } else {
        body = { password };
      }

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await res.json();
      if (!res.ok) {
        setError(result?.error ?? "No pudimos completar la acción.");
        return;
      }

      if (action === "close") {
        if (result.winner) {
          setSuccess(`Ganadora declarada: "${result.winner.title}".`);
        } else {
          setSuccess("Votación cerrada (no había propuestas con votos).");
        }
      } else if (action === "schedule") {
        setSuccess("Cierre programado. Los alumnos verán la cuenta atrás.");
      } else if (action === "reopen") {
        setSuccess("Votación reabierta. Ya se puede proponer y votar.");
      } else if (action === "reset") {
        setSuccess("Todo reiniciado. Propuestas y votos a cero.");
      }
      await refresh();
    } catch {
      setError("Error de red. Intenta de nuevo.");
    } finally {
      setBusy(null);
      setPendingAction(null);
      setPendingDurationMs(null);
    }
  }

  const state = data?.state;
  const isClosed = state?.status === "closed";
  const deadline =
    state?.status === "open" && state.deadline ? state.deadline : null;
  const proposals = data?.proposals ?? [];
  const totalVotes = proposals.reduce((acc, p) => acc + p.votes, 0);
  const leader = proposals.find((p) => p.votes > 0) ?? null;
  const winnerId = state?.status === "closed" ? state.winnerId : null;
  const winner = winnerId ? proposals.find((p) => p.id === winnerId) ?? null : null;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="rounded-2xl border border-masterlab-line bg-white p-6 shadow-soft">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-masterlab-blue">
              / panel admin
            </p>
            <h1 className="mt-2 font-display text-2xl font-semibold text-masterlab-ink">
              Control del laboratorio
            </h1>
            <p className="mt-2 text-sm text-masterlab-ink/60">
              Programa el cierre, declara manualmente al ganador o reinicia la
              ronda. También puedes exportar los resultados a CSV.
            </p>
          </div>
          <button
            onClick={onLock}
            className="shrink-0 rounded-full border border-masterlab-line bg-white px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-masterlab-ink/60 transition hover:border-masterlab-blue hover:text-masterlab-blue"
            aria-label="Cerrar sesión de admin"
          >
            Salir
          </button>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-3 text-center">
          <Metric
            label="Estado"
            value={isClosed ? "Cerrada" : "Abierta"}
            tone={isClosed ? "blue" : "ink"}
          />
          <Metric label="Propuestas" value={loading ? "—" : `${proposals.length}`} />
          <Metric label="Votos" value={loading ? "—" : `${totalVotes}`} />
        </div>

        {!isClosed && deadline && (
          <div className="mt-4 flex items-center justify-between rounded-xl border border-masterlab-blue/30 bg-masterlab-blue/5 px-4 py-3">
            <span className="font-mono text-[10px] uppercase tracking-widest text-masterlab-blue">
              Cierre programado
            </span>
            <Countdown deadline={deadline} onExpire={refresh} variant="compact" />
          </div>
        )}

        {isClosed && winner && (
          <div className="mt-4 rounded-xl border border-masterlab-blue/30 bg-masterlab-blue/5 p-4">
            <p className="font-mono text-[10px] uppercase tracking-widest text-masterlab-blue">
              Ganadora declarada
            </p>
            <p className="mt-1 font-display text-base font-semibold text-masterlab-ink">
              {winner.title}
            </p>
            <p className="text-xs text-masterlab-ink/60">
              por {winner.authorName} · {winner.votes} votos
            </p>
          </div>
        )}
        {!isClosed && leader && (
          <div className="mt-4 rounded-xl border border-masterlab-line bg-masterlab-mist/60 p-4">
            <p className="font-mono text-[10px] uppercase tracking-widest text-masterlab-ink/50">
              En cabeza ahora
            </p>
            <p className="mt-1 font-display text-base font-semibold text-masterlab-ink">
              {leader.title}
            </p>
            <p className="text-xs text-masterlab-ink/60">
              por {leader.authorName} · {leader.votes} votos
            </p>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-masterlab-line bg-white p-6 shadow-soft">
        {!isClosed && (
          <div>
            <h3 className="font-display text-sm font-semibold text-masterlab-ink">
              Programar cierre
            </h3>
            <p className="mt-1 text-xs text-masterlab-ink/60">
              Elige cuánto durará la votación. Al llegar a cero, se cierra sola y
              se muestra el ganador con animación.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => requireConfirm("schedule", preset.ms)}
                  disabled={busy !== null}
                  className="rounded-full border border-masterlab-line bg-white px-3 py-1.5 text-xs font-semibold text-masterlab-ink transition hover:border-masterlab-blue hover:text-masterlab-blue disabled:opacity-50"
                >
                  {preset.label}
                </button>
              ))}
            </div>
            {pendingAction === "schedule" && pendingDurationMs && (
              <div className="mt-3 space-y-2 rounded-lg border border-masterlab-blue/30 bg-masterlab-blue/5 p-2 text-xs text-masterlab-ink">
                <p>
                  ¿Programar cierre en{" "}
                  <strong>{formatDuration(pendingDurationMs)}</strong>?
                  {deadline && " Sobrescribirá el cierre ya programado."}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => runAction("schedule", pendingDurationMs)}
                    disabled={busy !== null}
                    className="flex-1 rounded-md bg-masterlab-blue px-2 py-1.5 text-xs font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
                  >
                    {busy === "schedule" ? "..." : "Sí, programar"}
                  </button>
                  <button
                    onClick={() => {
                      setPendingAction(null);
                      setPendingDurationMs(null);
                    }}
                    disabled={busy !== null}
                    className="flex-1 rounded-md border border-masterlab-line bg-white px-2 py-1.5 text-xs font-semibold text-masterlab-ink/70 transition hover:bg-masterlab-mist"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {!isClosed ? (
            <ActionCard
              tone="primary"
              title="Cerrar votación ya"
              description="Declara la ganadora inmediatamente con la propuesta más votada."
              cta="Declarar ganador"
              loading={busy === "close"}
              disabled={busy !== null}
              confirm={pendingAction === "close"}
              confirmLabel="¿Cerrar la ronda ahora?"
              onClick={() => requireConfirm("close")}
              onConfirm={() => runAction("close")}
              onCancel={() => setPendingAction(null)}
            />
          ) : (
            <ActionCard
              tone="primary"
              title="Reabrir votación"
              description="Vuelve a permitir propuestas y votos sobre las ideas actuales."
              cta="Reabrir"
              loading={busy === "reopen"}
              disabled={busy !== null}
              confirm={pendingAction === "reopen"}
              confirmLabel="¿Reabrir la votación?"
              onClick={() => requireConfirm("reopen")}
              onConfirm={() => runAction("reopen")}
              onCancel={() => setPendingAction(null)}
            />
          )}

          <ActionCard
            tone="ghost"
            title="Exportar resultados"
            description="Descarga un CSV con todas las propuestas, votos y porcentajes."
            cta="Descargar CSV"
            loading={busy === "export"}
            disabled={busy !== null}
            confirm={false}
            confirmLabel=""
            onClick={() => runAction("export")}
            onConfirm={() => runAction("export")}
            onCancel={() => {}}
          />

          <ActionCard
            tone="danger"
            title="Reiniciar todo"
            description="Borra todas las propuestas, votos y la ronda actual. No se puede deshacer."
            cta="Reiniciar propuestas"
            loading={busy === "reset"}
            disabled={busy !== null}
            confirm={pendingAction === "reset"}
            confirmLabel="¿Borrar todo?"
            onClick={() => requireConfirm("reset")}
            onConfirm={() => runAction("reset")}
            onCancel={() => setPendingAction(null)}
          />
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}
        {success && (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
            {success}
          </div>
        )}
      </div>
    </div>
  );
}

function formatDuration(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.round(hours / 24);
  return `${days} d`;
}

function Metric({
  label,
  value,
  tone = "ink",
}: {
  label: string;
  value: string;
  tone?: "ink" | "blue";
}) {
  const toneClass =
    tone === "blue"
      ? "border-masterlab-blue/30 bg-masterlab-blue/10 text-masterlab-blue"
      : "border-masterlab-line bg-white text-masterlab-ink";
  return (
    <div className={`rounded-xl border px-3 py-3 ${toneClass}`}>
      <div className="font-mono text-[10px] uppercase tracking-widest opacity-60">
        {label}
      </div>
      <div className="mt-0.5 font-display text-lg font-semibold tabular-nums">
        {value}
      </div>
    </div>
  );
}

function ActionCard({
  tone,
  title,
  description,
  cta,
  loading,
  disabled,
  confirm,
  confirmLabel,
  onClick,
  onConfirm,
  onCancel,
}: {
  tone: "primary" | "danger" | "ghost";
  title: string;
  description: string;
  cta: string;
  loading: boolean;
  disabled: boolean;
  confirm: boolean;
  confirmLabel: string;
  onClick: () => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const baseBtn =
    tone === "primary"
      ? "bg-masterlab-ink text-white hover:bg-masterlab-blue"
      : tone === "ghost"
        ? "border border-masterlab-line bg-white text-masterlab-ink hover:border-masterlab-blue hover:text-masterlab-blue"
        : "bg-white text-red-700 border border-red-200 hover:bg-red-50";
  const confirmBtn =
    tone === "primary"
      ? "bg-masterlab-blue hover:brightness-110"
      : "bg-red-600 hover:bg-red-700";
  const confirmBox =
    tone === "primary"
      ? "border-masterlab-blue/30 bg-masterlab-blue/5 text-masterlab-ink"
      : "border-red-200 bg-red-50 text-red-700";

  return (
    <div className="flex flex-col rounded-xl border border-masterlab-line bg-white p-4">
      <h3 className="font-display text-sm font-semibold text-masterlab-ink">
        {title}
      </h3>
      <p className="mt-1 flex-1 text-xs text-masterlab-ink/60">{description}</p>

      {!confirm ? (
        <button
          onClick={onClick}
          disabled={disabled}
          className={`mt-3 inline-flex w-full items-center justify-center rounded-lg px-3 py-2 text-xs font-semibold transition disabled:opacity-50 ${baseBtn}`}
        >
          {loading ? "..." : cta}
        </button>
      ) : (
        <div className={`mt-3 space-y-2 rounded-lg border p-2 text-xs ${confirmBox}`}>
          <p>{confirmLabel}</p>
          <div className="flex gap-2">
            <button
              onClick={onConfirm}
              disabled={loading}
              className={`flex-1 rounded-md px-2 py-1.5 text-xs font-semibold text-white transition disabled:opacity-50 ${confirmBtn}`}
            >
              {loading ? "..." : "Sí, hazlo"}
            </button>
            <button
              onClick={onCancel}
              disabled={loading}
              className="flex-1 rounded-md border border-masterlab-line bg-white px-2 py-1.5 text-xs font-semibold text-masterlab-ink/70 transition hover:bg-masterlab-mist"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
