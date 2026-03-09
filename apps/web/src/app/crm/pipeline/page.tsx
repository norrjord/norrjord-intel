"use client";

import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import Link from "next/link";
import { ExternalLink, Calendar, ChevronRight } from "lucide-react";

import { orpc } from "@/utils/orpc";
import { StageBadge } from "@/components/crm/stage-badge";
import { ScoreBadge } from "@/components/crm/score-badge";
import { ProductionTypeBadge } from "@/components/crm/entity-type-badge";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

const STAGES = [
  { key: "new", label: "New" },
  { key: "reviewed", label: "Reviewed" },
  { key: "contacted", label: "Contacted" },
  { key: "replied", label: "Replied" },
  { key: "meeting_booked", label: "Meeting" },
  { key: "negotiating", label: "Negotiating" },
  { key: "closed_won", label: "Won" },
  { key: "closed_lost", label: "Lost" },
] as const;

const NEXT_STAGES: Record<string, string[]> = {
  new: ["reviewed", "contacted"],
  reviewed: ["contacted", "closed_lost"],
  contacted: ["replied", "closed_lost"],
  replied: ["meeting_booked", "contacted"],
  meeting_booked: ["negotiating", "closed_lost"],
  negotiating: ["closed_won", "closed_lost"],
  closed_won: [],
  closed_lost: ["new"],
};

export default function PipelinePage() {
  const [pipelineType, setPipelineType] = useState<string>("pilot");

  const board = useQuery(
    orpc.pipeline.getBoard.queryOptions({
      input: { pipelineType: pipelineType as "pilot" | "partner" | "investor" },
    }),
  );

  const updateStage = useMutation(
    orpc.pipeline.updateStage.mutationOptions({
      onSuccess: () => board.refetch(),
    }),
  );

  return (
    <div className="flex h-full flex-col">
      {/* Page header */}
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div>
          <h1 className="text-xl font-semibold">Pipeline</h1>
          <p className="text-sm text-muted-foreground">
            Track leads through your sales pipeline
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={pipelineType} onValueChange={(v) => v && setPipelineType(v)}>
            <SelectTrigger className="w-36 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pilot">Pilot</SelectItem>
              <SelectItem value="partner">Partner</SelectItem>
              <SelectItem value="investor">Investor</SelectItem>
            </SelectContent>
          </Select>
          <Link href="/crm/entities/new" className={buttonVariants({ size: "sm" })}>
            Add Lead
          </Link>
        </div>
      </div>

      {/* Board */}
      <ScrollArea className="flex-1">
        <div className="flex gap-4 p-6 min-w-max">
          {STAGES.map(({ key, label }) => {
            const items = (board.data as Record<string, Array<{
              relationshipId: string;
              entityId: string;
              entityName: string | null;
              entityDomain: string | null;
              productionType: string;
              regionText: string | null;
              pilotFitScore: number | null;
              nextActionDate: Date | string | null;
              priority: number;
              stackOrgId: string | null;
              stage: string;
            }>>)?.[key] ?? [];

            return (
              <div
                key={key}
                className="flex w-72 flex-shrink-0 flex-col rounded-xl bg-muted/30"
              >
                {/* Column header */}
                <div className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{label}</span>
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-xs font-medium text-muted-foreground">
                      {board.isLoading ? "–" : items.length}
                    </span>
                  </div>
                </div>

                {/* Cards */}
                <div className="flex flex-col gap-2 px-3 pb-3">
                  {board.isLoading ? (
                    <>
                      <Skeleton className="h-28 rounded-lg" />
                      <Skeleton className="h-28 rounded-lg" />
                    </>
                  ) : items.length === 0 ? (
                    <div className="rounded-lg border border-dashed py-8 text-center text-xs text-muted-foreground">
                      No leads
                    </div>
                  ) : (
                    items.map((item) => (
                      <div
                        key={item.relationshipId}
                        className="group rounded-lg border bg-card p-3.5 shadow-sm transition-shadow hover:shadow-md"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <Link
                            href={`/crm/entities/${item.entityId}`}
                            className="text-sm font-medium leading-tight hover:underline"
                          >
                            {item.entityName ?? "Unnamed"}
                          </Link>
                          {item.stackOrgId && (
                            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900" title="Linked to Stack">
                              <ExternalLink className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                            </span>
                          )}
                        </div>

                        {item.entityDomain && (
                          <p className="mt-1 text-xs text-muted-foreground truncate">
                            {item.entityDomain}
                          </p>
                        )}

                        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                          <ProductionTypeBadge type={item.productionType} />
                          <ScoreBadge score={item.pilotFitScore} label="pilot" />
                          {item.regionText && (
                            <span className="text-xs text-muted-foreground">
                              {item.regionText}
                            </span>
                          )}
                        </div>

                        {item.nextActionDate && (
                          <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                            <Calendar className="h-3 w-3" />
                            {new Date(item.nextActionDate).toLocaleDateString("sv-SE")}
                          </div>
                        )}

                        {/* Quick move buttons */}
                        {NEXT_STAGES[key]?.length ? (
                          <div className="mt-2.5 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                            {NEXT_STAGES[key]!.map((nextStage) => (
                              <button
                                key={nextStage}
                                onClick={() =>
                                  updateStage.mutate({
                                    id: item.relationshipId,
                                    stage: nextStage as typeof STAGES[number]["key"],
                                  })
                                }
                                disabled={updateStage.isPending}
                                className="flex items-center gap-0.5 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                              >
                                <ChevronRight className="h-3 w-3" />
                                {STAGES.find((s) => s.key === nextStage)?.label}
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
}
