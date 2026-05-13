"use client";

import { useState } from "react";

export function AdminPanel() {
  const [password, setPassword] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function reset() {
    if (busy) return;
    setError(null);
    setSuccess(null);
    setBusy(true);
    try {
      const res = await fetch("/api/admin/reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "No pudimos reiniciar.");
        setConfirming(false);
      } else {
        setSuccess("Todo reiniciado. Las propuestas y votos quedaron en cero.");
        setPassword("");
        setConfirming(false);
      }
    } catch {
      setError("Error de red. Intenta de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md rounded-2xl border border-masterlab-line bg-white p-6 shadow-soft">
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-masterlab-blue">
        / panel admin
      </p>
      <h1 className="mt-2 font-display text-2xl font-semibold text-masterlab-ink">
        Reiniciar laboratorio
      </h1>
      <p className="mt-2 text-sm text-masterlab-ink/60">
        Borra todas las propuestas y votos para arrancar una nueva ronda. Esta acción
        no se puede deshacer.
      </p>

      <div className="mt-5 space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-masterlab-ink/60">
            Contraseña
          </span>
          <input
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setConfirming(false);
            }}
            disabled={busy}
            placeholder="••••••••••"
            className="w-full rounded-lg border border-masterlab-line bg-white px-3 py-2.5 text-sm text-masterlab-ink outline-none transition placeholder:text-masterlab-ink/40 focus:border-masterlab-blue focus:shadow-ring"
          />
        </label>

        {!confirming ? (
          <button
            onClick={() => {
              setError(null);
              setSuccess(null);
              if (!password) {
                setError("Introduce la contraseña.");
                return;
              }
              setConfirming(true);
            }}
            disabled={busy}
            className="inline-flex w-full items-center justify-center rounded-lg bg-masterlab-ink px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-masterlab-blue disabled:opacity-50"
          >
            Reiniciar propuestas
          </button>
        ) : (
          <div className="space-y-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <p>¿Seguro? Se borran todas las propuestas y votos.</p>
            <div className="flex gap-2">
              <button
                onClick={reset}
                disabled={busy}
                className="flex-1 rounded-md bg-red-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
              >
                {busy ? "Reiniciando..." : "Sí, reiniciar"}
              </button>
              <button
                onClick={() => setConfirming(false)}
                disabled={busy}
                className="flex-1 rounded-md border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-100"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}
        {success && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
            {success}
          </div>
        )}
      </div>
    </div>
  );
}
