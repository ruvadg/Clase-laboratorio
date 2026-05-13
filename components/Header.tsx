import Link from "next/link";
import { WordMark } from "./Logo";

export function Header({ rightSlot }: { rightSlot?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-20 border-b border-masterlab-line/60 bg-white/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-5">
        <Link href="/" className="transition-opacity hover:opacity-80">
          <WordMark />
        </Link>
        <div className="flex items-center gap-3 text-xs text-masterlab-ink/60">
          {rightSlot}
        </div>
      </div>
    </header>
  );
}
