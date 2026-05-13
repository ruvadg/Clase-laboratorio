import Link from "next/link";
import { Header } from "@/components/Header";
import { ProposalsBoard } from "@/components/ProposalsBoard";

export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    <>
      <Header
        rightSlot={
          <Link
            href="/admin"
            className="rounded-full border border-masterlab-line bg-white px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-masterlab-ink/60 transition hover:border-masterlab-blue hover:text-masterlab-blue"
          >
            Admin
          </Link>
        }
      />
      <main className="mx-auto max-w-5xl px-5 py-10 sm:py-14">
        <ProposalsBoard />
        <footer className="mt-16 border-t border-masterlab-line/60 pt-6 text-center text-xs text-masterlab-ink/50">
          MasterLab IA · Laboratorio de clases en vivo
        </footer>
      </main>
    </>
  );
}
