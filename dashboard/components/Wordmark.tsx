export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-baseline font-display text-2xl uppercase tracking-tight text-ink ${className}`}>
      Sidefoot
      <span className="ml-0.5 h-2 w-2 translate-y-[-1px] rounded-full bg-proof shadow-glow" />
    </span>
  );
}
