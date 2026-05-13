"use client";

import { useEffect, useMemo, useState } from "react";
import type { ProposalWithVoteState } from "@/lib/types";

type ApiList = {
  proposals: ProposalWithVoteState[];
  hasProposed: boolean;
  hasVoted: boolean;
};

const TITLE_MAX = 120;
const DESC_MAX = 600;

export function ProposalsBoard() {
  const [state, setState] = useState<ApiList | null>(null);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [voting, setVoting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function refresh() {
    try {
      const res = await fetch("/api/proposals", { cache: "no-store" });
      const data = (await res.json()) as ApiList;
      setState(data);
    } catch {
      setError("No pudimos cargar las propuestas. Recarga la página.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  const topId = useMemo(() => state?.proposals[0]?.id, [state]);

  async function submitProposal(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/proposals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: title.trim(), description: description.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "No pudimos enviar tu propuesta.");
      } else {
        setTitle("");
        setDescription("");
        setSuccess("¡Propuesta enviada! Ya aparece en la lista.");
        await refresh();
      }
    } catch {
      setError("Error de red. Intenta de nuevo.");
    } finally {
      setSubmitting(false);
    }
  }

  async function castVote(id: string) {
    if (voting) return;
    setError(null);
    setSuccess(null);
    setVoting(id);
    try {
      const res = await fetch(`/api/proposals/${id}/vote`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "No pudimos registrar tu voto.");
      } else {
        setSuccess("Voto registrado.");
        await refresh();
      }
    } catch {
      setError("Error de red. Intenta de nuevo.");
    } finally {
      setVoting(null);
    }
  }

  const hasProposed = state?.hasProposed ?? false;
  const hasVoted = state?.hasVoted ?? false;
  const proposals = state?.proposals ?? [];

  return (
    <div className="space-y-12">
      <section className="relative overflow-hidden rounded-3xl border border-masterlab-line bg-white p-8 shadow-soft sm:p-10">
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-masterlab-blue/10 blur-3xl" />
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-masterlab-blue">
          / laboratorio
        </p>
        <h1 className="mt-3 font-display text-4xl font-semibold leading-tight tracking-tight text-masterlab-ink sm:text-5xl">
          Propón la próxima clase del{" "}
          <span className="italic font-medium text-masterlab-blue">laboratorio</span>.
        </h1>
        <p className="mt-4 max-w-2xl text-base text-masterlab-ink/70 sm:text-lg">
          Comparte qué te gustaría aprender en la próxima sesión en vivo de MasterLab IA.
          La clase con más votos será la que construiremos juntos en el laboratorio.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-2 text-xs text-masterlab-ink/60">
          <Badge>1 propuesta por persona</Badge>
          <Badge>1 voto por persona</Badge>
          <Badge>Resultados en vivo</Badge>
        </div>
      </section>

      <section className="grid gap-8 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <h2 className="font-display text-xl font-semibold text-masterlab-ink">
            {hasProposed ? "Ya enviaste tu propuesta" : "Enviar mi propuesta"}
          </h2>
          <p className="mt-1 text-sm text-masterlab-ink/60">
            {hasProposed
              ? "Solo se permite una propuesta por persona. Recuerda votar la que más te guste."
              : "Describe el tema, el formato y por qué te interesa."}
          </p>
          <form
            onSubmit={submitProposal}
            className="mt-4 space-y-3 rounded-2xl border border-masterlab-line bg-white p-5 shadow-soft"
          >
            <Field
              label="Tema de la clase"
              hint={`${title.length} / ${TITLE_MAX}`}
            >
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value.slice(0, TITLE_MAX))}
                disabled={hasProposed || submitting}
                placeholder="Ej. Construir un agente que automatice Notion"
                className="w-full rounded-lg border border-masterlab-line bg-white px-3 py-2.5 text-sm text-masterlab-ink outline-none transition placeholder:text-masterlab-ink/40 focus:border-masterlab-blue focus:shadow-ring disabled:bg-masterlab-mist/60"
              />
            </Field>
            <Field
              label="Detalles (opcional)"
              hint={`${description.length} / ${DESC_MAX}`}
            >
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value.slice(0, DESC_MAX))}
                disabled={hasProposed || submitting}
                rows={4}
                placeholder="¿Qué te gustaría aprender? ¿Qué problema resolverías con esa clase?"
                className="w-full resize-none rounded-lg border border-masterlab-line bg-white px-3 py-2.5 text-sm text-masterlab-ink outline-none transition placeholder:text-masterlab-ink/40 focus:border-masterlab-blue focus:shadow-ring disabled:bg-masterlab-mist/60"
              />
            </Field>
            <button
              type="submit"
              disabled={hasProposed || submitting || title.trim().length < 3}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-masterlab-blue px-4 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:brightness-110 disabled:cursor-not-allowed disabled:bg-masterlab-ink/15 disabled:text-masterlab-ink/40"
            >
              {submitting ? "Enviando..." : hasProposed ? "Ya enviaste tu propuesta" : "Enviar propuesta"}
            </button>
            {error && <Alert kind="error">{error}</Alert>}
            {success && <Alert kind="success">{success}</Alert>}
          </form>
        </div>

        <div className="lg:col-span-3">
          <div className="flex items-end justify-between">
            <div>
              <h2 className="font-display text-xl font-semibold text-masterlab-ink">
                Propuestas
              </h2>
              <p className="mt-1 text-sm text-masterlab-ink/60">
                Vota una. La más votada será la próxima clase del laboratorio.
              </p>
            </div>
            <span className="rounded-full border border-masterlab-line bg-white px-3 py-1 text-xs text-masterlab-ink/60">
              {proposals.length} {proposals.length === 1 ? "idea" : "ideas"}
            </span>
          </div>

          <div className="mt-4 space-y-3">
            {loading && <SkeletonList />}
            {!loading && proposals.length === 0 && (
              <div className="rounded-2xl border border-dashed border-masterlab-line bg-white/50 p-8 text-center text-sm text-masterlab-ink/60">
                Aún no hay propuestas. ¡Sé el primero en proponer un tema!
              </div>
            )}
            {!loading &&
              proposals.map((p, idx) => (
                <ProposalCard
                  key={p.id}
                  proposal={p}
                  rank={idx + 1}
                  isTop={p.id === topId && p.votes > 0}
                  disabled={hasVoted || voting === p.id}
                  loading={voting === p.id}
                  hasVoted={hasVoted}
                  onVote={() => castVote(p.id)}
                />
              ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-masterlab-ink/60">
          {label}
        </span>
        {hint && <span className="text-[10px] text-masterlab-ink/40">{hint}</span>}
      </div>
      {children}
    </label>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-masterlab-line bg-white px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest text-masterlab-ink/60">
      <span className="h-1.5 w-1.5 rounded-full bg-masterlab-blue" />
      {children}
    </span>
  );
}

function Alert({
  kind,
  children,
}: {
  kind: "error" | "success";
  children: React.ReactNode;
}) {
  const styles =
    kind === "error"
      ? "border-red-200 bg-red-50 text-red-700"
      : "border-emerald-200 bg-emerald-50 text-emerald-700";
  return (
    <div className={`rounded-lg border px-3 py-2 text-xs ${styles}`}>{children}</div>
  );
}

function SkeletonList() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-24 animate-pulse rounded-2xl border border-masterlab-line bg-white/60"
        />
      ))}
    </div>
  );
}

function ProposalCard({
  proposal,
  rank,
  isTop,
  disabled,
  loading,
  hasVoted,
  onVote,
}: {
  proposal: ProposalWithVoteState;
  rank: number;
  isTop: boolean;
  disabled: boolean;
  loading: boolean;
  hasVoted: boolean;
  onVote: () => void;
}) {
  return (
    <article
      className={`group relative flex animate-pop-in items-stretch gap-4 rounded-2xl border bg-white p-4 shadow-soft transition ${
        isTop
          ? "border-masterlab-blue/40 ring-1 ring-masterlab-blue/20"
          : "border-masterlab-line"
      }`}
    >
      <div className="flex flex-col items-center justify-center rounded-xl bg-masterlab-mist px-3 py-2 text-center">
        <span className="font-display text-2xl font-semibold tabular-nums text-masterlab-ink">
          {proposal.votes}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-widest text-masterlab-ink/50">
          votos
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-widest text-masterlab-ink/40">
            #{rank}
          </span>
          {isTop && (
            <span className="rounded-full bg-masterlab-blue px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-white">
              En cabeza
            </span>
          )}
          {proposal.mineToEdit && (
            <span className="rounded-full border border-masterlab-line px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-masterlab-ink/60">
              Tu propuesta
            </span>
          )}
          {proposal.votedByMe && (
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-emerald-700">
              Tu voto
            </span>
          )}
        </div>
        <h3 className="mt-1 font-display text-base font-semibold leading-snug text-masterlab-ink">
          {proposal.title}
        </h3>
        {proposal.description && (
          <p className="mt-1 whitespace-pre-wrap text-sm text-masterlab-ink/70">
            {proposal.description}
          </p>
        )}
      </div>

      <div className="flex items-center">
        <button
          onClick={onVote}
          disabled={disabled || proposal.votedByMe}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition ${
            proposal.votedByMe
              ? "bg-emerald-50 text-emerald-700"
              : hasVoted
                ? "bg-masterlab-mist text-masterlab-ink/40 cursor-not-allowed"
                : "bg-masterlab-ink text-white hover:bg-masterlab-blue"
          }`}
          aria-label={`Votar por ${proposal.title}`}
        >
          {proposal.votedByMe ? (
            <>
              <Check /> Votado
            </>
          ) : loading ? (
            "..."
          ) : (
            <>
              <Up /> Votar
            </>
          )}
        </button>
      </div>
    </article>
  );
}

function Up() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 5l7 8h-4v6h-6v-6H5l7-8z"
        fill="currentColor"
      />
    </svg>
  );
}

function Check() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 12.5l4.5 4.5L19 7"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
