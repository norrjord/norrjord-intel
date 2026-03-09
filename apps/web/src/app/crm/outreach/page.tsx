"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Mail,
  Send,
  Plus,
  Loader2,
  CheckCircle2,
  XCircle,
  SkipForward,
  Clock,
  FileText,
  Trash2,
  Eye,
} from "lucide-react";
import { toast } from "sonner";
import { env } from "@norrjord-intel/env/web";

import { orpc } from "@/utils/orpc";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

// ─── Send Tab ──────────────────────────────────────────

function SendTab() {
  const queryClient = useQueryClient();
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [campaignName, setCampaignName] = useState("");
  const [minScore, setMinScore] = useState<string>("");
  const [entityType, setEntityType] = useState<string>("all");
  const [productionType, setProductionType] = useState<string>("all");
  const [hideInactive, setHideInactive] = useState(true);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{
    campaignId: string;
    sent: number;
    skipped: number;
    failed: number;
    total: number;
  } | null>(null);

  const templates = useQuery(orpc.outreach.listTemplates.queryOptions({}));

  const preview = useQuery(
    orpc.outreach.preview.queryOptions({
      input: {
        filters: {
          minScore: minScore ? Number(minScore) : undefined,
          entityType: entityType !== "all" ? (entityType as "producer") : undefined,
          productionType: productionType !== "all" ? (productionType as "beef") : undefined,
          hideInactive: hideInactive || undefined,
        },
      },
    }),
  );

  const readyRecipients = preview.data?.recipients.filter(
    (r) => r.status === "ready",
  ) ?? [];

  async function handleSend() {
    if (!selectedTemplateId || readyRecipients.length === 0) return;
    setSending(true);
    setResult(null);

    try {
      const res = await fetch(`${env.NEXT_PUBLIC_SERVER_URL}/api/send-campaign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          campaignName: campaignName || undefined,
          templateId: selectedTemplateId,
          entityIds: readyRecipients.map((r) => r.entityId),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setResult(data);
      toast.success(`Campaign sent: ${data.sent} emails delivered`);
      queryClient.invalidateQueries({ queryKey: ["outreach"] });
      preview.refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send");
    } finally {
      setSending(false);
    }
  }

  const statusCounts = {
    ready: preview.data?.recipients.filter((r) => r.status === "ready").length ?? 0,
    no_email: preview.data?.recipients.filter((r) => r.status === "no_email").length ?? 0,
    already_emailed: preview.data?.recipients.filter((r) => r.status === "already_emailed").length ?? 0,
  };

  return (
    <div className="grid grid-cols-[1fr_400px] gap-6">
      {/* Left: Configuration */}
      <div className="space-y-6">
        {/* Campaign name */}
        <div className="space-y-2">
          <Label>Campaign name</Label>
          <Input
            placeholder={`Campaign ${new Date().toLocaleDateString("sv-SE")}`}
            value={campaignName}
            onChange={(e) => setCampaignName(e.target.value)}
          />
        </div>

        {/* Template selection */}
        <div className="space-y-2">
          <Label>Email template</Label>
          {templates.data && templates.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No templates yet. Create one in the Templates tab.
            </p>
          ) : (
            <Select value={selectedTemplateId} onValueChange={(v) => setSelectedTemplateId(v ?? "")}>
              <SelectTrigger>
                <SelectValue placeholder="Select a template..." />
              </SelectTrigger>
              <SelectContent>
                {templates.data?.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Filters */}
        <div className="space-y-2">
          <Label>Recipient filters</Label>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Min. score</p>
              <Select value={minScore || "any"} onValueChange={(v) => setMinScore(!v || v === "any" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Any" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any score</SelectItem>
                  {[3, 4, 5, 6, 7, 8, 9].map((s) => (
                    <SelectItem key={s} value={String(s)}>{s}+ score</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Entity type</p>
              <Select value={entityType} onValueChange={(v) => setEntityType(v ?? "all")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  <SelectItem value="producer">Producer</SelectItem>
                  <SelectItem value="partner">Partner</SelectItem>
                  <SelectItem value="investor">Investor</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Production</p>
              <Select value={productionType} onValueChange={(v) => setProductionType(v ?? "all")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="beef">Beef</SelectItem>
                  <SelectItem value="lamb">Lamb</SelectItem>
                  <SelectItem value="pork">Pork</SelectItem>
                  <SelectItem value="game">Game</SelectItem>
                  <SelectItem value="poultry">Poultry</SelectItem>
                  <SelectItem value="mixed">Mixed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setHideInactive(!hideInactive)}
            className={`flex items-center gap-1.5 rounded-md border px-3 h-9 text-xs font-medium transition-colors self-end ${
              hideInactive
                ? "bg-green-50 border-green-200 text-green-700 dark:bg-green-950/30 dark:border-green-800 dark:text-green-400"
                : "bg-muted/50 border-transparent text-muted-foreground"
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${hideInactive ? "bg-green-500" : "bg-muted-foreground/30"}`} />
            Active only
          </button>
        </div>

        <Separator />

        {/* Recipient breakdown */}
        <div className="space-y-3">
          <Label>Recipients ({preview.data?.totalCount ?? 0} entities matched)</Label>

          {preview.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Checking recipients...
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              <div className="flex items-center gap-2 rounded-lg border p-3">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <div>
                  <p className="text-sm font-medium">{statusCounts.ready} will send</p>
                  <p className="text-xs text-muted-foreground">Valid emails</p>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-lg border p-3">
                <SkipForward className="h-4 w-4 text-blue-500" />
                <div>
                  <p className="text-sm font-medium">{statusCounts.already_emailed} already sent</p>
                  <p className="text-xs text-muted-foreground">Won't send again</p>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-lg border p-3">
                <XCircle className="h-4 w-4 text-red-500" />
                <div>
                  <p className="text-sm font-medium">{statusCounts.no_email} no email</p>
                  <p className="text-xs text-muted-foreground">Missing contact email</p>
                </div>
              </div>
            </div>
          )}
        </div>

        <Separator />

        {/* Send button */}
        <div className="flex items-center gap-3">
          <Button
            size="lg"
            disabled={!selectedTemplateId || readyRecipients.length === 0 || sending}
            onClick={handleSend}
          >
            {sending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            Send to {readyRecipients.length} entities
          </Button>

          {!selectedTemplateId && (
            <p className="text-sm text-muted-foreground">Select a template first</p>
          )}
        </div>

        {/* Result */}
        {result && (
          <div className="rounded-lg border border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950 p-4">
            <p className="font-medium text-green-800 dark:text-green-200">
              Campaign sent successfully
            </p>
            <div className="mt-2 flex gap-4 text-sm">
              <span className="text-green-700 dark:text-green-300">{result.sent} sent</span>
              <span className="text-yellow-700 dark:text-yellow-300">{result.skipped} skipped</span>
              <span className="text-red-700 dark:text-red-300">{result.failed} failed</span>
            </div>
          </div>
        )}
      </div>

      {/* Right: Recipient list */}
      <Card className="h-fit max-h-[calc(100vh-220px)]">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">
            Recipient list
          </CardTitle>
        </CardHeader>
        <ScrollArea className="h-[calc(100vh-320px)]">
          <CardContent className="pt-0">
            {preview.isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : preview.data?.recipients.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No entities match your filters
              </p>
            ) : (
              <div className="space-y-1">
                {preview.data?.recipients.map((r) => (
                  <div
                    key={r.entityId}
                    className={`flex items-center gap-2 rounded px-2 py-1.5 text-xs ${
                      r.status === "ready" ? "" : "opacity-50"
                    }`}
                  >
                    {r.status === "ready" && <CheckCircle2 className="h-3 w-3 shrink-0 text-green-500" />}
                    {r.status === "already_emailed" && <SkipForward className="h-3 w-3 shrink-0 text-blue-500" />}
                    {r.status === "no_email" && <XCircle className="h-3 w-3 shrink-0 text-red-500" />}

                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{r.entityName ?? "Unknown"}</p>
                      <p className="text-muted-foreground truncate">
                        {r.email ?? "No email"}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </ScrollArea>
      </Card>
    </div>
  );
}

// ─── Templates Tab ──────────────────────────────────────

function TemplatesTab() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [html, setHtml] = useState("");
  const [description, setDescription] = useState("");

  const templates = useQuery(orpc.outreach.listTemplates.queryOptions({}));

  const createTemplate = useMutation(
    orpc.outreach.createTemplate.mutationOptions({
      onSuccess: () => {
        toast.success("Template created");
        queryClient.invalidateQueries({ queryKey: ["outreach"] });
        resetForm();
      },
    }),
  );

  const updateTemplate = useMutation(
    orpc.outreach.updateTemplate.mutationOptions({
      onSuccess: () => {
        toast.success("Template updated");
        queryClient.invalidateQueries({ queryKey: ["outreach"] });
        resetForm();
      },
    }),
  );

  const deleteTemplate = useMutation(
    orpc.outreach.deleteTemplate.mutationOptions({
      onSuccess: () => {
        toast.success("Template deleted");
        queryClient.invalidateQueries({ queryKey: ["outreach"] });
      },
    }),
  );

  function resetForm() {
    setShowCreate(false);
    setEditId(null);
    setName("");
    setSubject("");
    setHtml("");
    setDescription("");
  }

  function startEdit(t: { id: string; name: string; subject: string; html: string; description: string | null }) {
    setEditId(t.id);
    setName(t.name);
    setSubject(t.subject);
    setHtml(t.html);
    setDescription(t.description ?? "");
    setShowCreate(true);
  }

  function handleSave() {
    if (!name || !subject || !html) {
      toast.error("Fill in name, subject, and HTML");
      return;
    }
    if (editId) {
      updateTemplate.mutate({ id: editId, name, subject, html, description: description || undefined });
    } else {
      createTemplate.mutate({ name, subject, html, description: description || undefined });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Manage your email templates. Paste HTML email content.
        </p>
        <Button size="sm" onClick={() => { resetForm(); setShowCreate(true); }}>
          <Plus className="mr-1.5 h-4 w-4" />
          New template
        </Button>
      </div>

      {templates.isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : templates.data?.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <FileText className="h-10 w-10 text-muted-foreground/50 mb-3" />
          <p className="text-sm font-medium">No templates yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Create your first email template to start sending outreach.
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {templates.data?.map((t) => (
            <Card key={t.id}>
              <CardContent className="flex items-center justify-between py-4">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{t.name}</p>
                  <p className="text-sm text-muted-foreground truncate">{t.subject}</p>
                  {t.description && (
                    <p className="text-xs text-muted-foreground mt-1">{t.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 ml-4">
                  <Button size="sm" variant="ghost" onClick={() => setPreviewHtml(t.html)}>
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => startEdit(t)}>
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => deleteTemplate.mutate({ id: t.id })}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit dialog */}
      <Dialog open={showCreate} onOpenChange={(open) => { if (!open) resetForm(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>{editId ? "Edit template" : "New template"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Template name</Label>
                <Input
                  placeholder="e.g. Cold outreach v1"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Subject line</Label>
                <Input
                  placeholder="e.g. {{company}} — Vill ni nå fler kunder?"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description (optional)</Label>
              <Input
                placeholder="Short description of this template"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>HTML content</Label>
              <Textarea
                placeholder="Paste your HTML email template here..."
                className="font-mono text-xs min-h-[300px]"
                value={html}
                onChange={(e) => setHtml(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={resetForm}>Cancel</Button>
              <Button
                onClick={handleSave}
                disabled={createTemplate.isPending || updateTemplate.isPending}
              >
                {(createTemplate.isPending || updateTemplate.isPending) && (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                )}
                {editId ? "Update" : "Create"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Preview dialog */}
      <Dialog open={!!previewHtml} onOpenChange={() => setPreviewHtml(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Template preview</DialogTitle>
          </DialogHeader>
          <div className="rounded-lg border overflow-hidden bg-white">
            <iframe
              srcDoc={previewHtml ?? ""}
              className="w-full h-[500px]"
              sandbox=""
              title="Email preview"
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── History Tab ────────────────────────────────────────

function HistoryTab() {
  const campaigns = useQuery(orpc.outreach.listCampaigns.queryOptions({}));
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);

  const campaignDetail = useQuery({
    ...orpc.outreach.getCampaign.queryOptions({
      input: { id: selectedCampaignId! },
    }),
    enabled: !!selectedCampaignId,
  });

  return (
    <div className="space-y-4">
      {campaigns.isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : campaigns.data?.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Clock className="h-10 w-10 text-muted-foreground/50 mb-3" />
          <p className="text-sm font-medium">No campaigns yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Send your first campaign from the Send tab.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {campaigns.data?.map((c) => (
            <Card
              key={c.id}
              className={`cursor-pointer transition-colors hover:bg-accent/50 ${
                selectedCampaignId === c.id ? "ring-2 ring-primary" : ""
              }`}
              onClick={() => setSelectedCampaignId(
                selectedCampaignId === c.id ? null : c.id,
              )}
            >
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{c.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Template: {c.template?.name ?? "Unknown"} ·{" "}
                      {c.sentAt
                        ? new Date(c.sentAt).toLocaleDateString("sv-SE", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "Not sent"}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge
                      variant={
                        c.status === "completed"
                          ? "default"
                          : c.status === "failed"
                            ? "destructive"
                            : "secondary"
                      }
                    >
                      {c.status}
                    </Badge>
                    <div className="flex gap-2 text-xs">
                      <span className="text-green-600">{c.sentCount} sent</span>
                      <span className="text-yellow-600">{c.skippedCount} skipped</span>
                      <span className="text-red-600">{c.failedCount} failed</span>
                    </div>
                  </div>
                </div>

                {/* Expanded detail */}
                {selectedCampaignId === c.id && (
                  <div className="mt-4 border-t pt-4">
                    {campaignDetail.isLoading ? (
                      <div className="flex justify-center py-4">
                        <Loader2 className="h-4 w-4 animate-spin" />
                      </div>
                    ) : campaignDetail.data?.sends?.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No send records found</p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Entity</TableHead>
                            <TableHead>Email</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Sent at</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {campaignDetail.data?.sends?.map((s) => (
                            <TableRow key={s.id}>
                              <TableCell className="font-medium">
                                {s.entity?.name ?? s.entity?.companyName ?? "—"}
                              </TableCell>
                              <TableCell className="text-muted-foreground">
                                {s.email || "—"}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant={
                                    s.status === "sent"
                                      ? "default"
                                      : s.status === "failed"
                                        ? "destructive"
                                        : "secondary"
                                  }
                                  className="text-xs"
                                >
                                  {s.status}
                                </Badge>
                                {s.error && (
                                  <span className="text-xs text-muted-foreground ml-2">
                                    {s.error}
                                  </span>
                                )}
                              </TableCell>
                              <TableCell className="text-muted-foreground text-sm">
                                {new Date(s.sentAt).toLocaleString("sv-SE")}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────

export default function OutreachPage() {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-6 py-4">
        <h1 className="text-xl font-semibold">Outreach</h1>
        <p className="text-sm text-muted-foreground">
          Send email campaigns to your entities
        </p>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <Tabs defaultValue="send">
          <TabsList>
            <TabsTrigger value="send">
              <Send className="mr-1.5 h-4 w-4" />
              Send
            </TabsTrigger>
            <TabsTrigger value="templates">
              <FileText className="mr-1.5 h-4 w-4" />
              Templates
            </TabsTrigger>
            <TabsTrigger value="history">
              <Clock className="mr-1.5 h-4 w-4" />
              History
            </TabsTrigger>
          </TabsList>

          <TabsContent value="send" className="mt-6">
            <SendTab />
          </TabsContent>

          <TabsContent value="templates" className="mt-6">
            <TemplatesTab />
          </TabsContent>

          <TabsContent value="history" className="mt-6">
            <HistoryTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
