"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
  Users,
  TrendingUp,
  Calendar,
  Zap,
  ArrowRight,
  MessageSquare,
} from "lucide-react";

import { orpc } from "@/utils/orpc";
import { StageBadge } from "@/components/crm/stage-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const STAGE_ORDER = [
  "new",
  "reviewed",
  "contacted",
  "replied",
  "meeting_booked",
  "negotiating",
  "closed_won",
  "closed_lost",
];

const STAGE_LABELS: Record<string, string> = {
  new: "New",
  reviewed: "Reviewed",
  contacted: "Contacted",
  replied: "Replied",
  meeting_booked: "Meeting",
  negotiating: "Negotiating",
  closed_won: "Won",
  closed_lost: "Lost",
};

export default function DashboardPage() {
  const stats = useQuery(orpc.dashboard.getStats.queryOptions());
  const d = stats.data;

  // Build stage map
  const stageMap: Record<string, number> = {};
  if (d?.stageCounts) {
    for (const s of d.stageCounts) {
      stageMap[s.stage] = Number(s.count);
    }
  }
  const maxStageCount = Math.max(1, ...Object.values(stageMap));
  const totalInPipeline = Object.values(stageMap).reduce((a, b) => a + b, 0);

  return (
    <div className="p-6 space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Overview of your CRM activity
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard
          label="Total Entities"
          value={d?.totalEntities}
          icon={Users}
          loading={stats.isLoading}
        />
        <StatCard
          label="In Pipeline"
          value={totalInPipeline || undefined}
          icon={Zap}
          loading={stats.isLoading}
        />
        <StatCard
          label="Conversion Rate"
          value={d?.conversionRate != null ? `${d.conversionRate}%` : undefined}
          icon={TrendingUp}
          loading={stats.isLoading}
          accent
        />
        <StatCard
          label="Last Discovery"
          value={
            d?.latestRun
              ? new Date(d.latestRun.startedAt).toLocaleDateString("sv-SE")
              : "No runs"
          }
          subtitle={
            d?.latestRun
              ? `${d.latestRun.entitiesCreated} new, ${d.latestRun.entitiesUpdated} updated`
              : undefined
          }
          icon={Calendar}
          loading={stats.isLoading}
        />
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* Pipeline funnel */}
        <Card className="col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Pipeline Funnel</CardTitle>
          </CardHeader>
          <CardContent>
            {stats.isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-6" />
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {STAGE_ORDER.map((stage) => {
                  const count = stageMap[stage] ?? 0;
                  const pct = maxStageCount > 0 ? (count / maxStageCount) * 100 : 0;
                  return (
                    <div key={stage} className="flex items-center gap-3">
                      <span className="w-24 text-xs text-muted-foreground text-right">
                        {STAGE_LABELS[stage]}
                      </span>
                      <div className="flex-1 h-7 bg-muted/50 rounded-md overflow-hidden relative">
                        <div
                          className={`h-full rounded-md transition-all ${
                            stage === "closed_won"
                              ? "bg-emerald-200 dark:bg-emerald-800"
                              : stage === "closed_lost"
                                ? "bg-red-200 dark:bg-red-800"
                                : "bg-primary/15"
                          }`}
                          style={{ width: `${Math.max(pct, count > 0 ? 2 : 0)}%` }}
                        />
                        <span className="absolute inset-0 flex items-center px-3 text-xs font-medium">
                          {count}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Upcoming follow-ups */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">Upcoming Follow-ups</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            {stats.isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-10" />
                ))}
              </div>
            ) : !d?.upcomingFollowUps?.length ? (
              <p className="py-6 text-center text-xs text-muted-foreground">
                No upcoming follow-ups
              </p>
            ) : (
              <div className="space-y-2">
                {d.upcomingFollowUps.map((f) => (
                  <Link
                    key={f.relationshipId}
                    href={`/crm/entities/${f.entityId}`}
                    className="flex items-center justify-between rounded-lg p-2 hover:bg-muted/50 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {f.entityName ?? "Unnamed"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {f.nextActionDate
                          ? new Date(f.nextActionDate).toLocaleDateString("sv-SE")
                          : ""}
                      </p>
                    </div>
                    <StageBadge stage={f.stage} />
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent interactions */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">Recent Activity</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </div>
        </CardHeader>
        <CardContent>
          {stats.isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          ) : !d?.recentInteractions?.length ? (
            <p className="py-6 text-center text-xs text-muted-foreground">
              No recent activity
            </p>
          ) : (
            <div className="space-y-1">
              {d.recentInteractions.map((i) => (
                <Link
                  key={i.id}
                  href={`/crm/entities/${i.entityId}`}
                  className="flex items-center gap-3 rounded-lg p-2 hover:bg-muted/50 transition-colors"
                >
                  <Badge variant="outline" className="text-[10px] capitalize flex-shrink-0">
                    {i.type.replace("_", " ")}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium">{i.entityName ?? "Unnamed"}</span>
                    {i.content && (
                      <p className="text-xs text-muted-foreground truncate">{i.content}</p>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground flex-shrink-0">
                    {new Date(i.occurredAt).toLocaleDateString("sv-SE")}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  label,
  value,
  subtitle,
  icon: Icon,
  loading,
  accent,
}: {
  label: string;
  value?: string | number;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  loading: boolean;
  accent?: boolean;
}) {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-muted-foreground">{label}</span>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        {loading ? (
          <Skeleton className="h-7 w-20" />
        ) : (
          <>
            <p className={`text-2xl font-semibold tracking-tight ${accent ? "text-emerald-600 dark:text-emerald-400" : ""}`}>
              {value ?? "—"}
            </p>
            {subtitle && (
              <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
