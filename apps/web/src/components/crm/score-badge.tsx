export function ScoreBadge({
  score,
  label,
  size = "sm",
}: {
  score: number | null | undefined;
  label?: string;
  size?: "sm" | "lg";
}) {
  if (score == null) return <span className="text-xs text-muted-foreground">—</span>;

  const color =
    score >= 7
      ? "text-emerald-700 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-950"
      : score >= 4
        ? "text-amber-700 bg-amber-50 dark:text-amber-300 dark:bg-amber-950"
        : "text-red-700 bg-red-50 dark:text-red-300 dark:bg-red-950";

  const sizeClass =
    size === "lg"
      ? "px-2.5 py-1 text-sm font-bold min-w-8 justify-center"
      : "px-2 py-0.5 text-xs font-semibold";

  return (
    <span className={`inline-flex items-center gap-1 rounded-md ${sizeClass} ${color}`}>
      {score}
      {label && <span className="font-normal text-[10px] opacity-70">/{label}</span>}
    </span>
  );
}
