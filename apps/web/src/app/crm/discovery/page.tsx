"use client";

import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Globe,
  Clock,
  CheckCircle,
  CheckCircle2,
  XCircle,
  StopCircle,
  Loader2,
  Search,
  ClipboardPaste,
  Building2,
  BarChart3,
  ExternalLink,
  ChevronDown,
  Link2,
  Mail,
} from "lucide-react";
import { toast } from "sonner";

import { env } from "@norrjord-intel/env/web";
import { orpc } from "@/utils/orpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function DiscoveryPage() {
  const [polling, setPolling] = useState(false);

  const runHistory = useQuery({
    ...orpc.discovery.getRunHistory.queryOptions({ input: { limit: 20 } }),
    refetchInterval: polling ? 3000 : false,
  });

  const runs = runHistory.data ?? [];
  const activeRuns = runs.filter((r: any) => !r.completedAt);

  useEffect(() => {
    setPolling(activeRuns.length > 0);
  }, [activeRuns.length]);

  const triggerSearch = useMutation(
    orpc.discovery.triggerSearch.mutationOptions({
      onSuccess: (data) => {
        toast.success(data.message);
        setPolling(true);
        setTimeout(() => runHistory.refetch(), 2000);
      },
    }),
  );

  const triggerAllabolag = useMutation(
    orpc.discovery.triggerAllabolag.mutationOptions({
      onSuccess: (data) => {
        toast.success(data.message);
        setPolling(true);
        setTimeout(() => runHistory.refetch(), 2000);
      },
    }),
  );

  const cancelRun = useMutation(
    orpc.discovery.cancelRun.mutationOptions({
      onSuccess: (data) => {
        if (data.ok) {
          toast.success("Run cancelled");
        } else {
          toast.error(data.message);
        }
        runHistory.refetch();
      },
    }),
  );

  return (
    <div className="flex h-full flex-col overflow-auto">
      <div className="border-b px-6 py-4">
        <h1 className="text-xl font-semibold">Discovery</h1>
        <p className="text-sm text-muted-foreground">
          Find meat producers, slaughterhouses, and related businesses
        </p>
      </div>

      <div className="flex-1 p-6 space-y-6 max-w-2xl">
        {/* Discovery Actions */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Automated Discovery</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="outline"
                className="h-auto flex-col items-start gap-1 p-3 overflow-hidden"
                disabled={triggerSearch.isPending}
                onClick={() => triggerSearch.mutate({})}
              >
                <div className="flex items-center gap-2">
                  {triggerSearch.isPending ? (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                  ) : (
                    <Globe className="h-4 w-4 shrink-0" />
                  )}
                  <span className="font-medium text-sm">Google Search</span>
                </div>
                <span className="text-xs text-muted-foreground text-left line-clamp-2">
                  Search, classify, score, and enrich automatically
                </span>
              </Button>

              <Button
                variant="outline"
                className="h-auto flex-col items-start gap-1 p-3 overflow-hidden"
                disabled={triggerAllabolag.isPending}
                onClick={() => triggerAllabolag.mutate({})}
              >
                <div className="flex items-center gap-2">
                  {triggerAllabolag.isPending ? (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4 shrink-0" />
                  )}
                  <span className="font-medium text-sm">Allabolag</span>
                </div>
                <span className="text-xs text-muted-foreground text-left line-clamp-2">
                  Find companies by meat industry SNI codes
                </span>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Data Quality Jobs */}
        <DataQualityJobs />

        {/* URL Import */}
        <UrlImportSection />

        {/* Text Import */}
        <TextImportSection />

        {/* Active runs indicator */}
        {activeRuns.length > 0 && (
          <div className="rounded-md border border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/50 px-4 py-3 space-y-2">
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
              <span className="text-sm font-medium">
                {activeRuns.length === 1
                  ? "Discovery running..."
                  : `${activeRuns.length} runs active...`}
              </span>
            </div>
            {activeRuns.map((run: any) => {
              const elapsed = Math.round(
                (Date.now() - new Date(run.startedAt).getTime()) / 1000,
              );
              return (
                <div
                  key={run.id}
                  className="flex items-center justify-between text-xs text-muted-foreground"
                >
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {run.sourceChannel === "enrich"
                        ? "Enrich"
                        : run.sourceChannel === "allabolag"
                          ? "Allabolag"
                          : "Search"}
                    </Badge>
                    {run.region && <span>{run.region}</span>}
                  </div>
                  <div className="flex items-center gap-3">
                    {(run.urlsFound > 0 || run.entitiesCreated > 0) && (
                      <span>
                        {run.urlsFound > 0 && `${run.urlsFound} URLs`}
                        {run.relevantFound > 0 &&
                          ` · ${run.relevantFound} relevant`}
                        {run.entitiesCreated > 0 &&
                          ` · ${run.entitiesCreated} created`}
                      </span>
                    )}
                    <span>
                      {Math.floor(elapsed / 60)}m {elapsed % 60}s
                    </span>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      className="text-destructive hover:text-destructive"
                      disabled={cancelRun.isPending}
                      onClick={() => cancelRun.mutate({ runId: run.id })}
                    >
                      <StopCircle className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Run history */}
        <div>
          <h2 className="text-sm font-medium flex items-center gap-2 mb-3">
            <Clock className="h-4 w-4" />
            Run History
          </h2>
          {runs.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No discovery runs yet
            </p>
          ) : (
            <div className="space-y-2">
              {runs.map((run: any) => {
                const isRunning = !run.completedAt;
                const duration = run.completedAt
                  ? Math.round(
                      (new Date(run.completedAt).getTime() -
                        new Date(run.startedAt).getTime()) /
                        1000,
                    )
                  : null;

                return (
                  <div
                    key={run.id}
                    className="flex items-center justify-between rounded-md border px-3 py-2"
                  >
                    <div className="flex items-center gap-3">
                      {isRunning ? (
                        <Loader2 className="h-3 w-3 animate-spin text-blue-500" />
                      ) : (run.errors as any[])?.length > 0 ? (
                        <XCircle className="h-3 w-3 text-amber-500" />
                      ) : (
                        <CheckCircle className="h-3 w-3 text-green-500" />
                      )}
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium">
                            {run.sourceChannel === "reko_scrape"
                              ? "REKO Import"
                              : run.sourceChannel === "enrich"
                                ? "Enrichment"
                                : run.sourceChannel === "allabolag"
                                  ? "Allabolag"
                                  : "Search"}
                          </span>
                          {run.region && (
                            <Badge variant="outline" className="text-xs">
                              {run.region}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {new Date(run.startedAt).toLocaleString("sv-SE")}
                          {duration !== null &&
                            ` · ${Math.floor(duration / 60)}m ${duration % 60}s`}
                        </p>
                      </div>
                    </div>
                    <div className="text-right text-xs">
                      <p>
                        <span className="font-medium">
                          {run.entitiesCreated}
                        </span>{" "}
                        <span className="text-muted-foreground">created</span>
                      </p>
                      {run.relevantFound > 0 && (
                        <p className="text-muted-foreground">
                          {run.relevantFound} relevant
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Data Quality Jobs ──────────────────────────────────

function DataQualityJobs() {
  const [jobStatus, setJobStatus] = useState<Record<string, { running: boolean; startedAt?: string }>>({});
  const [polling, setPolling] = useState(false);

  async function fetchStatus() {
    try {
      const res = await fetch(`${env.NEXT_PUBLIC_SERVER_URL}/api/jobs/status`, {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setJobStatus(data);
        const anyRunning = Object.values(data).some((j: any) => j.running);
        setPolling(anyRunning);
      }
    } catch {}
  }

  useEffect(() => {
    fetchStatus();
  }, []);

  useEffect(() => {
    if (!polling) return;
    const interval = setInterval(fetchStatus, 3000);
    return () => clearInterval(interval);
  }, [polling]);

  async function triggerJob(name: string) {
    try {
      const res = await fetch(`${env.NEXT_PUBLIC_SERVER_URL}/api/jobs/${name}`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message);
        setPolling(true);
        fetchStatus();
      } else {
        toast.error(data.message);
      }
    } catch {
      toast.error("Failed to start job");
    }
  }

  const jobs = [
    {
      id: "enrich",
      label: "Enrich",
      description: "Allabolag business data",
      icon: Building2,
    },
    {
      id: "check-activity",
      label: "Activity Check",
      description: "Verify companies are active",
      icon: CheckCircle,
    },
    {
      id: "find-emails",
      label: "Find Emails",
      description: "Scrape websites for emails",
      icon: Mail,
    },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Data Quality</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-3">
          {jobs.map((job) => {
            const status = jobStatus[job.id];
            const isRunning = status?.running ?? false;
            return (
              <Button
                key={job.id}
                variant="outline"
                className="h-auto min-w-0 flex-col items-start gap-1 p-3 overflow-hidden whitespace-normal"
                disabled={isRunning}
                onClick={() => triggerJob(job.id)}
              >
                <div className="flex items-center gap-2">
                  {isRunning ? (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                  ) : (
                    <job.icon className="h-4 w-4 shrink-0" />
                  )}
                  <span className="font-medium text-sm">{job.label}</span>
                </div>
                <span className="text-xs text-muted-foreground text-left line-clamp-2">
                  {isRunning ? "Running..." : job.description}
                </span>
              </Button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── URL Import ─────────────────────────────────────────

interface UrlImportResult {
  entityId: string;
  name: string;
  domain: string;
  scores: { pilot_fit: number; investor_fit: number; modernization: number; scale: number } | null;
  summary: string | null;
  enriched: boolean;
  revenue: number | null;
  employeeCount: number | null;
  municipality: string | null;
}

function UrlImportSection() {
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState<"idle" | "processing" | "done" | "error">("idle");
  const [result, setResult] = useState<UrlImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleImport() {
    const trimmed = url.trim();
    if (!trimmed) return;

    setStatus("processing");
    setResult(null);
    setError(null);

    try {
      const res = await fetch(`${env.NEXT_PUBLIC_SERVER_URL}/api/import-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ url: trimmed }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Import failed");
        setStatus("error");
        return;
      }

      setResult(data);
      setStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      setStatus("error");
    }
  }

  return (
    <Card>
      <CardContent className="pt-4 space-y-3">
        <div className="flex items-center gap-2">
          <Link2 className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Import URL</span>
        </div>
        <div className="flex gap-2">
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://erikslundsgard.se"
            className="h-9 text-sm"
            disabled={status === "processing"}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleImport();
            }}
          />
          <Button
            onClick={handleImport}
            disabled={!url.trim() || status === "processing"}
            size="sm"
            className="h-9 px-4"
          >
            {status === "processing" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Go"
            )}
          </Button>
        </div>

        {status === "processing" && (
          <p className="text-xs text-muted-foreground">
            Fetching website, AI scoring, enriching from allabolag...
          </p>
        )}

        {error && (
          <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
            <XCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {result && (
          <div className="rounded-md border p-3 space-y-2">
            <div className="flex items-center justify-between">
              <Link
                href={`/crm/entities/${result.entityId}`}
                className="text-sm font-medium hover:underline flex items-center gap-1"
              >
                {result.name}
                <ExternalLink className="h-3 w-3" />
              </Link>
              {result.scores && (
                <div className="flex items-center gap-2 text-xs">
                  <span className={result.scores.pilot_fit >= 7 ? "text-emerald-600 font-medium" : "text-muted-foreground"}>
                    Pilot: {result.scores.pilot_fit}
                  </span>
                  <span className={result.scores.investor_fit >= 7 ? "text-emerald-600 font-medium" : "text-muted-foreground"}>
                    Investor: {result.scores.investor_fit}
                  </span>
                </div>
              )}
            </div>
            {result.summary && (
              <p className="text-xs text-muted-foreground">{result.summary}</p>
            )}
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              {result.municipality && <span>{result.municipality}</span>}
              {result.revenue != null && (
                <span>{Math.round(result.revenue / 1000)} TSEK</span>
              )}
              {result.employeeCount != null && (
                <span>{result.employeeCount} anställda</span>
              )}
              {result.enriched ? (
                <Badge variant="outline" className="text-[10px]">Enriched</Badge>
              ) : (
                <Badge variant="outline" className="text-[10px] opacity-50">Not enriched</Badge>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Text Import (inline, collapsible) ──────────────────

interface ParsedProducer {
  name: string | null;
  isMeat: boolean;
  type: string;
  products: string[];
  website: string | null;
  confidence: number;
}

interface EntityResult {
  id: string;
  name: string | null;
  enriched: boolean;
  deepAnalyzed: boolean;
  websiteFetched: boolean;
}

interface ImportResponse {
  parsed: {
    totalPosts: number;
    meatProducers: number;
    nonMeatSkipped: number;
    allProducers: ParsedProducer[];
  };
  imported: {
    created: number;
    skippedExisting: number;
    skippedNonMeat: number;
    skippedLowConfidence: number;
  };
  entities: EntityResult[];
  error?: string;
}

function TextImportSection() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [regionHint, setRegionHint] = useState("");
  const [groupName, setGroupName] = useState("");
  const [status, setStatus] = useState<"idle" | "parsing" | "done" | "error">("idle");
  const [result, setResult] = useState<ImportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleImport() {
    if (text.trim().length < 20) return;

    setStatus("parsing");
    setResult(null);
    setError(null);

    try {
      const res = await fetch(`${env.NEXT_PUBLIC_SERVER_URL}/api/import-reko`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          text: text.trim(),
          regionHint: regionHint || undefined,
          rekoGroupName: groupName || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Import failed");
        setStatus("error");
        return;
      }

      setResult(data);
      setStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      setStatus("error");
    }
  }

  return (
    <Card>
      <button
        type="button"
        className="flex w-full items-center justify-between px-6 py-3"
        onClick={() => setOpen(!open)}
      >
        <div className="flex items-center gap-2">
          <ClipboardPaste className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Paste Text</span>
        </div>
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <CardContent className="border-t pt-4 space-y-4">
          <p className="text-xs text-muted-foreground">
            Paste text from any source (REKO posts, Instagram, Facebook, directories) — AI will extract producers, score them, and enrich.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="region" className="text-xs">
                Region hint
              </Label>
              <Input
                id="region"
                value={regionHint}
                onChange={(e) => setRegionHint(e.target.value)}
                placeholder="e.g. Uppsala"
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="group" className="text-xs">
                Source name
              </Label>
              <Input
                id="group"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="e.g. REKO Uppsala, Instagram"
                className="h-8 text-sm"
              />
            </div>
          </div>

          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste text here (REKO posts, Instagram bios, any producer info)..."
            className="min-h-[120px] font-mono text-sm"
            disabled={status === "parsing"}
          />

          <Button
            onClick={handleImport}
            disabled={text.trim().length < 20 || status === "parsing"}
            className="w-full"
          >
            {status === "parsing" ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <ClipboardPaste className="mr-2 h-4 w-4" />
                Import & Analyze
              </>
            )}
          </Button>

          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 p-3">
              <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
                <XCircle className="h-4 w-4 shrink-0" />
                <span className="text-sm">{error}</span>
              </div>
            </div>
          )}

          {result && (
            <div className="space-y-4">
              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: "Posts", value: result.parsed.totalPosts },
                  { label: "Meat producers", value: result.parsed.meatProducers, highlight: true },
                  { label: "Created", value: result.imported.created, highlight: true },
                  { label: "Existed", value: result.imported.skippedExisting },
                ].map((s) => (
                  <div key={s.label} className="rounded-md border p-2 text-center">
                    <p className={`text-lg font-bold tabular-nums ${s.highlight && s.value > 0 ? "text-emerald-600 dark:text-emerald-400" : ""}`}>
                      {s.value}
                    </p>
                    <p className="text-[10px] text-muted-foreground">{s.label}</p>
                  </div>
                ))}
              </div>

              {result.entities.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-medium">
                    Entities ({result.entities.length})
                  </h3>
                  {result.entities.map((ent) => (
                    <div key={ent.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                      <Link
                        href={`/crm/entities/${ent.id}`}
                        className="text-sm font-medium hover:underline flex items-center gap-1"
                      >
                        {ent.name ?? "Unnamed"}
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                      <div className="flex items-center gap-2">
                        <PipelineStep done={ent.websiteFetched} icon={Globe} label="Website" />
                        <PipelineStep done={ent.deepAnalyzed} icon={BarChart3} label="AI Scored" />
                        <PipelineStep done={ent.enriched} icon={Building2} label="Allabolag" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

function PipelineStep({
  done,
  icon: Icon,
  label,
}: {
  done: boolean;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <div
      className={`flex items-center gap-0.5 text-xs ${
        done ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground/40"
      }`}
      title={done ? `${label}: done` : `${label}: pending`}
    >
      <Icon className="h-3.5 w-3.5" />
      {done && <CheckCircle2 className="h-3 w-3" />}
    </div>
  );
}
