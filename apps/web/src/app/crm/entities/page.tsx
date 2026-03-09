"use client";

import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import Link from "next/link";
import {
  Plus,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  ThumbsUp,
  ThumbsDown,
  ArrowRight,
  Eye,
  ChevronDown,
  ChevronRight,
  Loader2,
  Send,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { orpc } from "@/utils/orpc";
import { StageBadge } from "@/components/crm/stage-badge";
import { ScoreBadge } from "@/components/crm/score-badge";
import { EntityTypeBadge, ProductionTypeBadge } from "@/components/crm/entity-type-badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

function formatRevenue(revenue: number | null): string {
  if (!revenue) return "—";
  if (revenue >= 1_000_000) return `${(revenue / 1_000_000).toFixed(1)} MSEK`;
  if (revenue >= 1_000) return `${Math.round(revenue / 1_000)} TSEK`;
  return `${revenue} SEK`;
}

export default function EntitiesPage() {
  const [search, setSearch] = useState("");
  const [entityType, setEntityType] = useState<string>("all");
  const [productionType, setProductionType] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("score");
  const [selectedCounties, setSelectedCounties] = useState<string[]>([]);
  const [inPipeline, setInPipeline] = useState<string>("all");
  const [hideInactive, setHideInactive] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);
  const limit = 30;

  const counties = useQuery(orpc.entity.getCounties.queryOptions({}));

  const entities = useQuery(
    orpc.entity.getAll.queryOptions({
      input: {
        search: search || undefined,
        entityType:
          entityType !== "all" ? (entityType as "producer") : undefined,
        productionType:
          productionType !== "all"
            ? (productionType as "beef")
            : undefined,
        counties: selectedCounties.length > 0 ? selectedCounties : undefined,
        inPipeline: inPipeline as "all",
        hideInactive: hideInactive || undefined,
        sortBy: sortBy as "score",
        limit,
        offset: page * limit,
      },
    }),
  );

  const moveStage = useMutation(
    orpc.pipeline.updateStageByEntity.mutationOptions({
      onSuccess: () => {
        entities.refetch();
      },
    }),
  );

  const sendToPipeline = useMutation(
    orpc.entity.sendToPipeline.mutationOptions({
      onSuccess: (data) => {
        toast.success(`${data.created} entities sent to pipeline`);
        setSelectedIds(new Set());
        entities.refetch();
      },
    }),
  );

  const totalPages = Math.ceil((entities.data?.total ?? 0) / limit);

  function handleStageChange(entityId: string, stage: string, label: string) {
    moveStage.mutate({ entityId, stage: stage as "new" });
    toast.success(`Moved to ${label}`);
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (!entities.data) return;
    const ids = entities.data.entities.map((e) => e.id);
    const allSelected = ids.every((id) => selectedIds.has(id));
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set([...selectedIds, ...ids]));
    }
  }

  function toggleCounty(county: string) {
    setSelectedCounties((prev) =>
      prev.includes(county)
        ? prev.filter((c) => c !== county)
        : [...prev, county],
    );
    setPage(0);
  }


  return (
    <div className="flex h-full flex-col">
      {/* Page header */}
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div>
          <h1 className="text-xl font-semibold">Entities</h1>
          <p className="text-sm text-muted-foreground">
            {entities.data?.total ?? 0} entities
            {selectedIds.size > 0 && (
              <span className="text-foreground font-medium">
                {" "}· {selectedIds.size} selected
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selectedIds.size > 0 && (
            <>
              <Button
                size="sm"
                onClick={() =>
                  sendToPipeline.mutate({
                    entityIds: [...selectedIds],
                  })
                }
                disabled={sendToPipeline.isPending}
              >
                {sendToPipeline.isPending ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-1.5 h-4 w-4" />
                )}
                Send to Pipeline ({selectedIds.size})
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSelectedIds(new Set())}
              >
                <X className="h-4 w-4" />
              </Button>
            </>
          )}
          <Link
            href="/crm/entities/new"
            className={buttonVariants({ size: "sm", variant: "outline" })}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Add
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 border-b px-6 py-3">
        <Input
          placeholder="Search by name or domain..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
          className="max-w-xs h-9 bg-muted/50 border-0"
        />
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Type</span>
          <Select
            value={entityType}
            onValueChange={(v) => {
              if (v) { setEntityType(v); setPage(0); }
            }}
          >
            <SelectTrigger className="w-32 h-9">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="producer">Producer</SelectItem>
              <SelectItem value="partner">Partner</SelectItem>
              <SelectItem value="investor">Investor</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Production</span>
          <Select
            value={productionType}
            onValueChange={(v) => {
              if (v) { setProductionType(v); setPage(0); }
            }}
          >
            <SelectTrigger className="w-32 h-9">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="beef">Nöt</SelectItem>
              <SelectItem value="lamb">Lamm</SelectItem>
              <SelectItem value="pork">Gris</SelectItem>
              <SelectItem value="game">Vilt</SelectItem>
              <SelectItem value="poultry">Fjäderfä</SelectItem>
              <SelectItem value="mixed">Blandat</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Pipeline</span>
          <Select
            value={inPipeline}
            onValueChange={(v) => {
              if (v) { setInPipeline(v); setPage(0); }
            }}
          >
            <SelectTrigger className="w-36 h-9">
              <SelectValue placeholder="All entities" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All entities</SelectItem>
              <SelectItem value="yes">In pipeline</SelectItem>
              <SelectItem value="no">Not in pipeline</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Sort by</span>
          <Select
            value={sortBy}
            onValueChange={(v) => {
              if (v) { setSortBy(v); setPage(0); }
            }}
          >
            <SelectTrigger className="w-36 h-9">
              <SelectValue placeholder="Score" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="score">Score (high first)</SelectItem>
              <SelectItem value="revenue">Revenue</SelectItem>
              <SelectItem value="name">Name A-Z</SelectItem>
              <SelectItem value="updated">Recently updated</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <button
          type="button"
          onClick={() => { setHideInactive(!hideInactive); setPage(0); }}
          className={`flex items-center gap-1.5 rounded-md border px-3 h-9 text-xs font-medium transition-colors ${
            hideInactive
              ? "bg-green-50 border-green-200 text-green-700 dark:bg-green-950/30 dark:border-green-800 dark:text-green-400"
              : "bg-muted/50 border-transparent text-muted-foreground"
          }`}
        >
          <span className={`h-2 w-2 rounded-full ${hideInactive ? "bg-green-500" : "bg-muted-foreground/30"}`} />
          Active only
        </button>
      </div>

      {/* County tags */}
      {(counties.data?.length ?? 0) > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-b px-6 py-2">
          <span className="text-xs text-muted-foreground mr-1">County:</span>
          {counties.data?.map((c) => (
            <button
              key={c.name}
              type="button"
              onClick={() => toggleCounty(c.name)}
              className={`rounded-md px-2 py-0.5 text-xs font-medium transition-colors ${
                selectedCounties.includes(c.name)
                  ? "bg-foreground text-background"
                  : c.count === 0
                    ? "bg-muted/50 text-muted-foreground/40 hover:bg-muted/60"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {c.name.replace(" län", "")}
              <span className={`ml-1 ${selectedCounties.includes(c.name) ? "opacity-70" : "opacity-50"}`}>
                {c.count}
              </span>
            </button>
          ))}
          {selectedCounties.length > 0 && (
            <button
              type="button"
              onClick={() => { setSelectedCounties([]); setPage(0); }}
              className="text-xs text-muted-foreground hover:text-foreground ml-1"
            >
              Clear
            </button>
          )}
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-6 w-10">
                <input
                  type="checkbox"
                  className="rounded border-muted-foreground/30"
                  checked={
                    (entities.data?.entities.length ?? 0) > 0 &&
                    (entities.data?.entities.every((e) => selectedIds.has(e.id)) ?? false)
                  }
                  onChange={toggleSelectAll}
                />
              </TableHead>
              <TableHead className="w-12">Score</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Business</TableHead>
              <TableHead>Revenue</TableHead>
              <TableHead>Active</TableHead>
              <TableHead>Stage</TableHead>
              <TableHead className="pr-6 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entities.isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 10 }).map((_, j) => (
                    <TableCell key={j} className={j === 0 ? "pl-6" : ""}>
                      <Skeleton className="h-4 w-20" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : entities.data?.entities.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={10}
                  className="h-32 text-center text-muted-foreground"
                >
                  No entities found
                </TableCell>
              </TableRow>
            ) : (
              entities.data?.entities.map((e) => (
                <EntityRow
                  key={e.id}
                  entity={e}
                  isExpanded={expandedId === e.id}
                  isSelected={selectedIds.has(e.id)}
                  onToggleExpand={() =>
                    setExpandedId(expandedId === e.id ? null : e.id)
                  }
                  onToggleSelect={() => toggleSelect(e.id)}
                  onStageChange={handleStageChange}
                />
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t px-6 py-3">
          <span className="text-sm text-muted-foreground">
            Page {page + 1} of {totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(Math.max(0, page - 1))}
              disabled={page === 0}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
              disabled={page >= totalPages - 1}
            >
              Next
            </Button>
          </div>
        </div>
      )}

    </div>
  );
}

// ─── Entity Row with expandable analysis ──────────────────

function EntityRow({
  entity: e,
  isExpanded,
  isSelected,
  onToggleExpand,
  onToggleSelect,
  onStageChange,
}: {
  entity: any;
  isExpanded: boolean;
  isSelected: boolean;
  onToggleExpand: () => void;
  onToggleSelect: () => void;
  onStageChange: (entityId: string, stage: string, label: string) => void;
}) {
  return (
    <>
      <TableRow className="cursor-pointer" onClick={onToggleExpand}>
        {/* Checkbox */}
        <TableCell className="pl-6" onClick={(ev) => ev.stopPropagation()}>
          <input
            type="checkbox"
            className="rounded border-muted-foreground/30"
            checked={isSelected}
            onChange={onToggleSelect}
          />
        </TableCell>

        {/* Score */}
        <TableCell>
          <div className="flex items-center gap-1.5">
            {isExpanded ? (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            )}
            <ScoreBadge score={e.pilotFitScore} size="lg" />
          </div>
        </TableCell>

        {/* Name + domain + production badge */}
        <TableCell>
          <div className="flex items-center gap-2">
            <Link
              href={`/crm/entities/${e.id}`}
              className="font-medium hover:underline"
              onClick={(ev) => ev.stopPropagation()}
            >
              {e.name ?? "Unnamed"}
            </Link>
            {e.stackOrgId && (
              <ExternalLink className="h-3 w-3 text-emerald-600" />
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            {e.domain && (
              <span className="text-xs text-muted-foreground">
                {e.domain}
              </span>
            )}
            <ProductionTypeBadge type={e.productionType} />
            <EntityTypeBadge type={e.entityType} />
          </div>
        </TableCell>

        {/* Source */}
        <TableCell>
          <SourceBadge type={e.sourceType} />
        </TableCell>

        {/* Location */}
        <TableCell className="text-sm max-w-44">
          {e.municipality || e.registeredCity ? (
            <div className="leading-tight">
              <span className="text-foreground">
                {e.municipality ?? e.registeredCity}
              </span>
              {e.county && (
                <span className="text-muted-foreground text-xs block">
                  {e.county}
                </span>
              )}
            </div>
          ) : e.regionText ? (
            <span className="text-muted-foreground/60 text-xs italic truncate block">
              {truncateText(e.regionText, 30)}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </TableCell>

        {/* Business info */}
        <TableCell>
          {e.enrichedAt ? (
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
              <div className="text-xs leading-tight">
                <span>{e.companyForm ?? ""}</span>
                {e.employeeCount != null && (
                  <span className="text-muted-foreground">
                    {" "}· {e.employeeCount} anst.
                  </span>
                )}
                {e.orgNumber && (
                  <p className="text-muted-foreground">{e.orgNumber}</p>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <AlertCircle className="h-3.5 w-3.5 text-muted-foreground/40" />
              <span className="text-xs text-muted-foreground/40">
                Not verified
              </span>
            </div>
          )}
        </TableCell>

        {/* Revenue */}
        <TableCell className="text-sm tabular-nums">
          {e.revenue ? (
            <span className="font-medium">{formatRevenue(e.revenue)}</span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </TableCell>

        {/* Activity */}
        <TableCell>
          <ActivityBadge status={e.activityStatus} websiteAlive={e.websiteAlive} />
        </TableCell>

        {/* Stage */}
        <TableCell>
          {e.stage ? (
            <StageBadge stage={e.stage} />
          ) : (
            <span className="text-xs text-muted-foreground/40">—</span>
          )}
        </TableCell>

        {/* Quick actions */}
        <TableCell className="pr-6" onClick={(ev) => ev.stopPropagation()}>
          <div className="flex items-center justify-end gap-1">
            {(!e.stage || e.stage === "new") && (
              <>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  title="Mark as reviewed"
                  onClick={() => onStageChange(e.id, "reviewed", "Reviewed")}
                >
                  <Eye className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="text-green-600 hover:text-green-700"
                  title="Move to contacted"
                  onClick={() => onStageChange(e.id, "contacted", "Contacted")}
                >
                  <ThumbsUp className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="text-destructive hover:text-destructive"
                  title="Dismiss (close lost)"
                  onClick={() => onStageChange(e.id, "closed_lost", "Dismissed")}
                >
                  <ThumbsDown className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
            {e.stage === "reviewed" && (
              <Button
                variant="ghost"
                size="icon-xs"
                className="text-green-600 hover:text-green-700"
                title="Move to contacted"
                onClick={() => onStageChange(e.id, "contacted", "Contacted")}
              >
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            )}
            {e.stage === "contacted" && (
              <Button
                variant="ghost"
                size="icon-xs"
                className="text-green-600 hover:text-green-700"
                title="Mark as replied"
                onClick={() => onStageChange(e.id, "replied", "Replied")}
              >
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </TableCell>
      </TableRow>

      {/* Expandable analysis row */}
      {isExpanded && (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={10} className="px-6 py-0">
            <AnalysisPanel entityId={e.id} />
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

// ─── Analysis Panel (lazy-loaded on expand) ───────────────

function AnalysisPanel({ entityId }: { entityId: string }) {
  const analysis = useQuery(
    orpc.entity.getAnalysis.queryOptions({
      input: { entityId },
    }),
  );

  if (analysis.isLoading) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Loading analysis...
      </div>
    );
  }

  const a = analysis.data;

  if (!a) {
    return (
      <p className="py-4 text-sm text-muted-foreground">
        No AI analysis available for this entity.
      </p>
    );
  }

  const raw = a.rawOutputJson as any;
  const extracted = (a.extractedFacts ?? raw?.extracted) as any;
  const factsUsed: string[] = raw?.facts_used ?? [];
  const unknowns: string[] = raw?.unknowns ?? [];

  return (
    <div className="py-6 space-y-5 border-b">
      {/* Score cards */}
      <div className="grid grid-cols-4 gap-4">
        <ScoreCard
          label="Pilot Fit"
          score={a.pilotFitScore}
          max={10}
          description="Direct sales signals, producer focus, professional readiness"
        />
        <ScoreCard
          label="Investor Fit"
          score={a.investorFitScore}
          max={10}
          description="Scale signals, organizational maturity, strategic adjacency"
        />
        <ScoreCard
          label="Modernization"
          score={a.modernizationScore}
          max={10}
          description="Website quality, e-commerce, social media, innovation"
        />
        <ScoreCard
          label="Scale"
          score={a.scaleScore}
          max={10}
          description="Production volume, product range, infrastructure, team"
        />
      </div>

      {/* Summary + Approach */}
      {(a.summary || a.suggestedAngle) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {a.summary && (
            <div className="space-y-1.5">
              <h4 className="text-sm font-semibold">Summary</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {a.summary}
              </p>
            </div>
          )}
          {a.suggestedAngle && (
            <div className="space-y-1.5">
              <h4 className="text-sm font-semibold">Suggested Approach</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {a.suggestedAngle}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Signal tags */}
      {(extracted?.direct_sales_signals?.length > 0 ||
        extracted?.scale_signals?.length > 0) && (
        <div className="space-y-2">
          {extracted?.direct_sales_signals?.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-medium text-muted-foreground mr-1">
                Sales signals
              </span>
              {extracted.direct_sales_signals.map((s: string, i: number) => (
                <span
                  key={`d${i}`}
                  className="rounded-md bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 text-xs"
                >
                  {s}
                </span>
              ))}
            </div>
          )}
          {extracted?.scale_signals?.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-medium text-muted-foreground mr-1">
                Scale signals
              </span>
              {extracted.scale_signals.map((s: string, i: number) => (
                <span
                  key={`s${i}`}
                  className="rounded-md bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 px-2 py-0.5 text-xs"
                >
                  {s}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Evidence + Unknowns */}
      {(factsUsed.length > 0 || unknowns.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {factsUsed.length > 0 && (
            <div className="space-y-1.5">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Evidence from website
              </h4>
              <ul className="space-y-1">
                {factsUsed.map((fact, i) => (
                  <li
                    key={i}
                    className="text-sm text-muted-foreground leading-snug flex items-start gap-2"
                  >
                    <span className="text-muted-foreground/40 mt-1 shrink-0">
                      &bull;
                    </span>
                    <span>{fact}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {unknowns.length > 0 && (
            <div className="space-y-1.5">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Unknowns
              </h4>
              <ul className="space-y-1">
                {unknowns.map((u, i) => (
                  <li
                    key={i}
                    className="text-sm text-muted-foreground/70 leading-snug flex items-start gap-2"
                  >
                    <span className="text-muted-foreground/30 mt-1 shrink-0">
                      ?
                    </span>
                    <span>{u}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <p className="text-xs text-muted-foreground/40 pt-1">
        {a.analysisType} analysis &middot;{" "}
        {new Date(a.createdAt).toLocaleDateString("sv-SE")}
      </p>
    </div>
  );
}

// ─── Score Card ───────────────────────────────────────────

function ScoreCard({
  label,
  score,
  max,
  description,
}: {
  label: string;
  score: number | null;
  max: number;
  description: string;
}) {
  const value = score ?? 0;
  const pct = (value / max) * 100;
  const color =
    value >= 7
      ? "bg-emerald-500"
      : value >= 4
        ? "bg-amber-500"
        : "bg-red-500";
  const textColor =
    value >= 7
      ? "text-emerald-600 dark:text-emerald-400"
      : value >= 4
        ? "text-amber-600 dark:text-amber-400"
        : "text-red-600 dark:text-red-400";

  return (
    <div className="rounded-lg border bg-card p-4 overflow-hidden">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium">{label}</span>
        <span className={`text-lg font-bold tabular-nums ${textColor}`}>
          {score ?? "—"}
          <span className="text-xs font-normal text-muted-foreground">
            /{max}
          </span>
        </span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden mb-2">
        <div
          className={`h-full rounded-full ${color} transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground leading-snug">{description}</p>
    </div>
  );
}

// ─── Activity Badge ───────────────────────────────────────

const ACTIVITY_CONFIG: Record<string, { label: string; className: string }> = {
  active: {
    label: "Active",
    className: "bg-green-50 text-green-700 dark:bg-green-950/60 dark:text-green-300",
  },
  likely_active: {
    label: "Likely active",
    className: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
  },
  likely_inactive: {
    label: "Likely inactive",
    className: "bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300",
  },
  inactive: {
    label: "Inactive",
    className: "bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300",
  },
  unknown: {
    label: "Unknown",
    className: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
  },
};

function ActivityBadge({
  status,
  websiteAlive,
}: {
  status: string | null;
  websiteAlive: string | null;
}) {
  const key = status ?? "unknown";
  const config = ACTIVITY_CONFIG[key] ?? ACTIVITY_CONFIG.unknown;
  return (
    <div className="flex items-center gap-1.5">
      <span
        className={`rounded px-1.5 py-0.5 text-[10px] font-medium leading-none ${config.className}`}
      >
        {config.label}
      </span>
      {websiteAlive === "no" && (
        <span className="text-[10px] text-red-500" title="Website down">
          ⊘
        </span>
      )}
    </div>
  );
}

// ─── Source Badge ─────────────────────────────────────────

const SOURCE_CONFIG: Record<string, { label: string; className: string }> = {
  search_api: {
    label: "Google",
    className: "bg-orange-50 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300",
  },
  reko_scrape: {
    label: "REKO",
    className: "bg-violet-50 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300",
  },
  instagram_scrape: {
    label: "Instagram",
    className: "bg-pink-50 text-pink-700 dark:bg-pink-950/60 dark:text-pink-300",
  },
  manual: {
    label: "Manual",
    className: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  },
  referral: {
    label: "Referral",
    className: "bg-cyan-50 text-cyan-700 dark:bg-cyan-950/60 dark:text-cyan-300",
  },
};

function SourceBadge({ type }: { type: string | null }) {
  if (!type) return null;
  const config = SOURCE_CONFIG[type];
  if (!config) return null;
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[10px] font-medium leading-none ${config.className}`}
    >
      {config.label}
    </span>
  );
}

// ─── Utils ────────────────────────────────────────────────

function truncateText(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + "...";
}
