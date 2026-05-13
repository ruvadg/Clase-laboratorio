export function Logo({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      aria-hidden
      className={className}
      fill="currentColor"
    >
      <path d="M32 4c2.6 9.4 8.6 15.4 18 18-9.4 2.6-15.4 8.6-18 18-2.6-9.4-8.6-15.4-18-18 9.4-2.6 15.4-8.6 18-18z" />
      <circle cx="52" cy="14" r="3.2" />
    </svg>
  );
}

export function WordMark({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Logo className="h-6 w-6 text-masterlab-blue" />
      <span className="font-display text-sm font-semibold tracking-widest text-masterlab-ink">
        MASTER<span className="italic font-medium text-masterlab-blue">LAB</span>
        <span className="ml-1 text-masterlab-ink/60 tracking-normal">IA</span>
      </span>
    </div>
  );
}
