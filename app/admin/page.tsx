import Link from "next/link";
import { Header } from "@/components/Header";
import { AdminPanel } from "@/components/AdminPanel";

export const dynamic = "force-dynamic";

export default function AdminPage() {
  return (
    <>
      <Header
        rightSlot={
          <Link
            href="/"
            className="rounded-full border border-masterlab-line bg-white px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-masterlab-ink/60 transition hover:border-masterlab-blue hover:text-masterlab-blue"
          >
            Volver
          </Link>
        }
      />
      <main className="mx-auto max-w-5xl px-5 py-16">
        <AdminPanel />
      </main>
    </>
  );
}
