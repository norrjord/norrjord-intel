"use client";

import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import {
  ArrowLeft,
  ExternalLink,
  Globe,
  Phone,
  Mail,
  Plus,
  Pencil,
  Trash2,
  Check,
  MessageSquare,
  Calendar,
} from "lucide-react";

import { orpc } from "@/utils/orpc";
import { StageBadge } from "@/components/crm/stage-badge";
import { ScoreBadge } from "@/components/crm/score-badge";
import {
  EntityTypeBadge,
  ProductionTypeBadge,
} from "@/components/crm/entity-type-badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

export default function EntityDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const entity = useQuery(orpc.entity.getById.queryOptions({ input: { id } }));
  const e = entity.data;

  const deleteMutation = useMutation(
    orpc.entity.delete.mutationOptions({
      onSuccess: () => {
        toast.success("Entity deleted");
        router.push("/crm/entities");
      },
    }),
  );

  if (entity.isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-32" />
        <div className="grid grid-cols-4 gap-4 mt-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!e) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Entity not found
      </div>
    );
  }

  const latestAnalysis = e.analyses?.[0];

  return (
    <div className="flex h-full flex-col overflow-auto">
      {/* Header */}
      <div className="border-b px-6 py-4">
        <div className="flex items-center gap-3 mb-3">
          <Link href="/crm/entities" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold">{e.name ?? "Unnamed"}</h1>
              <EntityTypeBadge type={e.entityType} />
              <ProductionTypeBadge type={e.productionType} />
              {e.stackOrgId && (
                <Badge
                  variant="outline"
                  className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300"
                >
                  <ExternalLink className="mr-1 h-3 w-3" />
                  Linked
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
              {e.domain && (
                <a
                  href={e.websiteUrl ?? `https://${e.domain}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 hover:text-foreground"
                >
                  <Globe className="h-3 w-3" />
                  {e.domain}
                </a>
              )}
              {e.regionText && <span>{e.regionText}</span>}
              {e.orgNumber && <span>Org: {e.orgNumber}</span>}
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => {
              if (confirm("Delete this entity and all related data?")) {
                deleteMutation.mutate({ id });
              }
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>

        {/* Score cards */}
        {latestAnalysis && (
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: "Pilot Fit", value: latestAnalysis.pilotFitScore },
              { label: "Investor Fit", value: latestAnalysis.investorFitScore },
              { label: "Modernization", value: latestAnalysis.modernizationScore },
              { label: "Scale", value: latestAnalysis.scaleScore },
            ].map(({ label, value }) => (
              <div
                key={label}
                className="rounded-xl border bg-card p-3 text-center"
              >
                <p className="text-xs text-muted-foreground mb-1">{label}</p>
                <ScoreBadge score={value} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="flex-1">
        <div className="border-b px-6">
          <TabsList className="bg-transparent h-auto p-0 gap-4">
            {["overview", "contacts", "pipeline", "timeline", "drafts", "sources"].map(
              (tab) => (
                <TabsTrigger
                  key={tab}
                  value={tab}
                  className="rounded-none border-b-2 border-transparent px-0 pb-3 pt-3 text-sm capitalize data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                >
                  {tab}
                </TabsTrigger>
              ),
            )}
          </TabsList>
        </div>

        <div className="p-6">
          {/* Overview Tab */}
          <TabsContent value="overview" className="mt-0 space-y-4">
            {latestAnalysis?.summary && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">AI Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm leading-relaxed">{latestAnalysis.summary}</p>
                </CardContent>
              </Card>
            )}
            {latestAnalysis?.suggestedAngle && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Suggested Angle</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm leading-relaxed">{latestAnalysis.suggestedAngle}</p>
                </CardContent>
              </Card>
            )}
            {latestAnalysis?.extractedFacts != null && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Extracted Facts</CardTitle>
                </CardHeader>
                <CardContent>
                  <pre className="text-xs bg-muted/50 rounded-lg p-3 overflow-auto whitespace-pre-wrap">
                    {JSON.stringify(latestAnalysis.extractedFacts, null, 2)}
                  </pre>
                </CardContent>
              </Card>
            )}
            {!latestAnalysis && (
              <div className="rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">
                No AI analysis available for this entity
              </div>
            )}
          </TabsContent>

          {/* Contacts Tab */}
          <TabsContent value="contacts" className="mt-0">
            <ContactsTab entityId={id} contacts={e.contacts} refetch={entity.refetch} />
          </TabsContent>

          {/* Pipeline Tab */}
          <TabsContent value="pipeline" className="mt-0">
            <PipelineTab entityId={id} relationships={e.relationships} refetch={entity.refetch} />
          </TabsContent>

          {/* Timeline Tab */}
          <TabsContent value="timeline" className="mt-0">
            <TimelineTab entityId={id} interactions={e.interactions} refetch={entity.refetch} />
          </TabsContent>

          {/* Drafts Tab */}
          <TabsContent value="drafts" className="mt-0">
            <DraftsTab entityId={id} drafts={e.drafts} refetch={entity.refetch} />
          </TabsContent>

          {/* Sources Tab */}
          <TabsContent value="sources" className="mt-0">
            <div className="space-y-2">
              {e.sources.length === 0 ? (
                <div className="rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">
                  No sources recorded
                </div>
              ) : (
                e.sources.map((s) => (
                  <div key={s.id} className="flex items-center gap-3 rounded-lg border p-3">
                    <Badge variant="outline" className="text-xs">{s.sourceType}</Badge>
                    <div className="flex-1 min-w-0">
                      {s.sourceQuery && <p className="text-sm truncate">{s.sourceQuery}</p>}
                      {s.sourceUrl && (
                        <a href={s.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground hover:underline truncate block">
                          {s.sourceUrl}
                        </a>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(s.discoveredAt).toLocaleDateString("sv-SE")}
                    </span>
                  </div>
                ))
              )}
            </div>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

// ─── Contacts Tab ───────────────────────────────────────

function ContactsTab({
  entityId,
  contacts,
  refetch,
}: {
  entityId: string;
  contacts: Array<{
    id: string;
    name: string | null;
    email: string | null;
    phone: string | null;
    roleTitle: string | null;
    isPrimary: boolean;
  }>;
  refetch: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [roleTitle, setRoleTitle] = useState("");

  const createContact = useMutation(
    orpc.contact.create.mutationOptions({
      onSuccess: () => {
        refetch();
        setOpen(false);
        setName("");
        setEmail("");
        setPhone("");
        setRoleTitle("");
      },
    }),
  );

  const deleteContact = useMutation(
    orpc.contact.delete.mutationOptions({ onSuccess: refetch }),
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{contacts.length} contacts</p>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger>
            <Button size="sm" variant="outline">
              <Plus className="mr-1.5 h-3 w-3" />
              Add Contact
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Contact</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={(ev) => {
                ev.preventDefault();
                createContact.mutate({ entityId, name, email, phone, roleTitle });
              }}
              className="space-y-3"
            >
              <div><Label>Name</Label><Input value={name} onChange={(ev) => setName(ev.target.value)} /></div>
              <div><Label>Email</Label><Input type="email" value={email} onChange={(ev) => setEmail(ev.target.value)} /></div>
              <div><Label>Phone</Label><Input value={phone} onChange={(ev) => setPhone(ev.target.value)} /></div>
              <div><Label>Role</Label><Input value={roleTitle} onChange={(ev) => setRoleTitle(ev.target.value)} /></div>
              <Button type="submit" disabled={createContact.isPending} className="w-full">
                {createContact.isPending ? "Adding..." : "Add Contact"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {contacts.length === 0 ? (
        <div className="rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">
          No contacts yet
        </div>
      ) : (
        contacts.map((c) => (
          <div key={c.id} className="flex items-center gap-4 rounded-lg border p-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-sm font-medium">
              {c.name?.charAt(0)?.toUpperCase() ?? "?"}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{c.name ?? "Unknown"}</span>
                {c.isPrimary && <Badge variant="outline" className="text-[10px]">Primary</Badge>}
                {c.roleTitle && <span className="text-xs text-muted-foreground">{c.roleTitle}</span>}
              </div>
              <div className="flex items-center gap-3 mt-0.5">
                {c.email && (
                  <a href={`mailto:${c.email}`} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                    <Mail className="h-3 w-3" />{c.email}
                  </a>
                )}
                {c.phone && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Phone className="h-3 w-3" />{c.phone}
                  </span>
                )}
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => deleteContact.mutate({ id: c.id })}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        ))
      )}
    </div>
  );
}

// ─── Pipeline Tab ───────────────────────────────────────

function PipelineTab({
  entityId,
  relationships,
  refetch,
}: {
  entityId: string;
  relationships: Array<{
    id: string;
    pipelineType: string;
    stage: string;
    priority: number;
    owner: string;
    nextActionDate: Date | string | null;
    notes: string | null;
  }>;
  refetch: () => void;
}) {
  const [addType, setAddType] = useState<string>("");

  const createPipeline = useMutation(
    orpc.pipeline.create.mutationOptions({ onSuccess: () => { refetch(); setAddType(""); } }),
  );

  const updateStage = useMutation(
    orpc.pipeline.updateStage.mutationOptions({ onSuccess: refetch }),
  );

  const updatePipeline = useMutation(
    orpc.pipeline.update.mutationOptions({ onSuccess: refetch }),
  );

  const existingTypes = relationships.map((r) => r.pipelineType);

  return (
    <div className="space-y-4">
      {relationships.length === 0 ? (
        <div className="rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">
          Not in any pipeline yet
        </div>
      ) : (
        relationships.map((r) => (
          <Card key={r.id}>
            <CardContent className="pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <Badge variant="outline" className="capitalize">{r.pipelineType}</Badge>
                <StageBadge stage={r.stage} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Stage</Label>
                  <Select
                    value={r.stage}
                    onValueChange={(v) => updateStage.mutate({ id: r.id, stage: v as "new" })}
                  >
                    <SelectTrigger className="h-9 mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["new", "reviewed", "contacted", "replied", "meeting_booked", "negotiating", "closed_won", "closed_lost"].map((s) => (
                        <SelectItem key={s} value={s} className="capitalize">
                          {s.replace("_", " ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Priority (1=highest)</Label>
                  <Select
                    value={String(r.priority)}
                    onValueChange={(v) => updatePipeline.mutate({ id: r.id, priority: Number(v) })}
                  >
                    <SelectTrigger className="h-9 mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4, 5].map((p) => (
                        <SelectItem key={p} value={String(p)}>{p}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label className="text-xs">Owner</Label>
                <Input
                  className="h-9 mt-1"
                  defaultValue={r.owner}
                  onBlur={(ev) => {
                    if (ev.target.value !== r.owner) {
                      updatePipeline.mutate({ id: r.id, owner: ev.target.value });
                    }
                  }}
                />
              </div>

              {r.nextActionDate && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Calendar className="h-3 w-3" />
                  Next action: {new Date(r.nextActionDate).toLocaleDateString("sv-SE")}
                </div>
              )}

              {r.notes && (
                <p className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-2">{r.notes}</p>
              )}
            </CardContent>
          </Card>
        ))
      )}

      {/* Add to pipeline */}
      {existingTypes.length < 3 && (
        <div className="flex items-center gap-2">
          <Select value={addType} onValueChange={(v) => v && setAddType(v)}>
            <SelectTrigger className="w-40 h-9">
              <SelectValue placeholder="Add pipeline..." />
            </SelectTrigger>
            <SelectContent>
              {["pilot", "partner", "investor"]
                .filter((t) => !existingTypes.includes(t))
                .map((t) => (
                  <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
                ))}
            </SelectContent>
          </Select>
          {addType && (
            <Button
              size="sm"
              onClick={() =>
                createPipeline.mutate({
                  entityId,
                  pipelineType: addType as "pilot",
                })
              }
              disabled={createPipeline.isPending}
            >
              Add
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Timeline Tab ───────────────────────────────────────

function TimelineTab({
  entityId,
  interactions,
  refetch,
}: {
  entityId: string;
  interactions: Array<{
    id: string;
    type: string;
    content: string | null;
    occurredAt: Date | string;
  }>;
  refetch: () => void;
}) {
  const [type, setType] = useState<string>("note");
  const [content, setContent] = useState("");

  const create = useMutation(
    orpc.interaction.create.mutationOptions({
      onSuccess: () => {
        refetch();
        setContent("");
      },
    }),
  );

  const typeIcons: Record<string, string> = {
    note: "N",
    call: "C",
    email_sent_manual: "E",
    meeting: "M",
  };

  return (
    <div className="space-y-4">
      {/* Add interaction */}
      <Card>
        <CardContent className="pt-4">
          <form
            onSubmit={(ev) => {
              ev.preventDefault();
              if (content.trim()) {
                create.mutate({
                  entityId,
                  type: type as "note",
                  content,
                });
              }
            }}
            className="space-y-3"
          >
            <div className="flex gap-2">
              <Select value={type} onValueChange={(v) => v && setType(v)}>
                <SelectTrigger className="w-36 h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="note">Note</SelectItem>
                  <SelectItem value="call">Call</SelectItem>
                  <SelectItem value="email_sent_manual">Email</SelectItem>
                  <SelectItem value="meeting">Meeting</SelectItem>
                </SelectContent>
              </Select>
              <Button type="submit" size="sm" disabled={!content.trim() || create.isPending}>
                Log
              </Button>
            </div>
            <Textarea
              placeholder="What happened?"
              value={content}
              onChange={(ev) => setContent(ev.target.value)}
              className="min-h-20"
            />
          </form>
        </CardContent>
      </Card>

      {/* Timeline */}
      {interactions.length === 0 ? (
        <div className="rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">
          No interactions yet
        </div>
      ) : (
        <div className="space-y-1">
          {interactions.map((i) => (
            <div key={i.id} className="flex gap-3 py-2">
              <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
                {typeIcons[i.type] ?? "?"}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px] capitalize">
                    {i.type.replace("_", " ")}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {new Date(i.occurredAt).toLocaleString("sv-SE")}
                  </span>
                </div>
                {i.content && (
                  <p className="mt-1 text-sm">{i.content}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Drafts Tab ─────────────────────────────────────────

function DraftsTab({
  entityId,
  drafts,
  refetch,
}: {
  entityId: string;
  drafts: Array<{
    id: string;
    subject: string;
    body: string;
    createdByAi: boolean;
    approved: boolean;
    createdAt: Date | string;
  }>;
  refetch: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const createDraft = useMutation(
    orpc.draft.create.mutationOptions({
      onSuccess: () => {
        refetch();
        setOpen(false);
        setSubject("");
        setBody("");
      },
    }),
  );

  const approveDraft = useMutation(
    orpc.draft.approve.mutationOptions({ onSuccess: refetch }),
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{drafts.length} drafts</p>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger>
            <Button size="sm" variant="outline">
              <Plus className="mr-1.5 h-3 w-3" />
              New Draft
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New Draft</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={(ev) => {
                ev.preventDefault();
                createDraft.mutate({ entityId, subject, body });
              }}
              className="space-y-3"
            >
              <div><Label>Subject</Label><Input value={subject} onChange={(ev) => setSubject(ev.target.value)} /></div>
              <div><Label>Body</Label><Textarea value={body} onChange={(ev) => setBody(ev.target.value)} className="min-h-32" /></div>
              <Button type="submit" disabled={createDraft.isPending} className="w-full">
                Create
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {drafts.length === 0 ? (
        <div className="rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">
          No drafts yet
        </div>
      ) : (
        drafts.map((d) => (
          <Card key={d.id}>
            <CardContent className="pt-4 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">{d.subject}</p>
                <div className="flex items-center gap-2">
                  {d.createdByAi && (
                    <Badge variant="outline" className="text-[10px]">AI</Badge>
                  )}
                  {d.approved ? (
                    <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300">
                      <Check className="mr-0.5 h-2.5 w-2.5" />Approved
                    </Badge>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => approveDraft.mutate({ id: d.id })}
                      className="h-6 text-xs"
                    >
                      Approve
                    </Button>
                  )}
                </div>
              </div>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{d.body}</p>
              <p className="text-xs text-muted-foreground">
                {new Date(d.createdAt).toLocaleString("sv-SE")}
              </p>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
