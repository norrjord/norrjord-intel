import { Badge } from "@/components/ui/badge";

const typeConfig: Record<string, { label: string; className: string }> = {
  producer: { label: "Producer", className: "bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800" },
  partner: { label: "Partner", className: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800" },
  investor: { label: "Investor", className: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950 dark:text-violet-300 dark:border-violet-800" },
  unknown: { label: "Unknown", className: "bg-gray-50 text-gray-500 border-gray-200 dark:bg-gray-900 dark:text-gray-400 dark:border-gray-700" },
};

const productionConfig: Record<string, string> = {
  beef: "Nöt",
  lamb: "Lamm",
  pork: "Gris",
  game: "Vilt",
  poultry: "Fjäderfä",
  mixed: "Blandat",
  unknown: "Okänt",
};

export function EntityTypeBadge({ type }: { type: string }) {
  const config = typeConfig[type] ?? typeConfig.unknown;
  return (
    <Badge variant="outline" className={`text-xs font-medium ${config!.className}`}>
      {config!.label}
    </Badge>
  );
}

export function ProductionTypeBadge({ type }: { type: string }) {
  return (
    <Badge variant="outline" className="text-xs font-medium">
      {productionConfig[type] ?? type}
    </Badge>
  );
}
