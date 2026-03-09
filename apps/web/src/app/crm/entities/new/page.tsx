"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { orpc } from "@/utils/orpc";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

export default function NewEntityPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [regionText, setRegionText] = useState("");
  const [entityType, setEntityType] = useState("producer");
  const [productionType, setProductionType] = useState("unknown");
  const [orgNumber, setOrgNumber] = useState("");

  const create = useMutation(
    orpc.entity.create.mutationOptions({
      onSuccess: (data) => {
        toast.success("Entity created");
        router.push(`/crm/entities/${data.id}`);
      },
    }),
  );

  return (
    <div className="p-6 max-w-lg">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/crm/entities" className={buttonVariants({ variant: "ghost", size: "sm" })}>
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="text-xl font-semibold">Add Entity</h1>
      </div>

      <Card>
        <CardContent className="pt-6">
          <form
            onSubmit={(ev) => {
              ev.preventDefault();
              create.mutate({
                name,
                websiteUrl: websiteUrl || undefined,
                regionText: regionText || undefined,
                entityType: entityType as "producer",
                productionType: productionType as "unknown",
                orgNumber: orgNumber || undefined,
              });
            }}
            className="space-y-4"
          >
            <div>
              <Label>Name *</Label>
              <Input
                value={name}
                onChange={(ev) => setName(ev.target.value)}
                placeholder="Gård AB"
                className="mt-1"
                required
              />
            </div>

            <div>
              <Label>Website</Label>
              <Input
                value={websiteUrl}
                onChange={(ev) => setWebsiteUrl(ev.target.value)}
                placeholder="https://example.se"
                className="mt-1"
              />
            </div>

            <div>
              <Label>Region</Label>
              <Input
                value={regionText}
                onChange={(ev) => setRegionText(ev.target.value)}
                placeholder="Norrbotten"
                className="mt-1"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Entity Type</Label>
                <Select value={entityType} onValueChange={(v) => v && setEntityType(v)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="producer">Producer</SelectItem>
                    <SelectItem value="partner">Partner</SelectItem>
                    <SelectItem value="investor">Investor</SelectItem>
                    <SelectItem value="unknown">Unknown</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Production Type</Label>
                <Select value={productionType} onValueChange={(v) => v && setProductionType(v)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="beef">Nöt</SelectItem>
                    <SelectItem value="lamb">Lamm</SelectItem>
                    <SelectItem value="pork">Gris</SelectItem>
                    <SelectItem value="game">Vilt</SelectItem>
                    <SelectItem value="poultry">Fjäderfä</SelectItem>
                    <SelectItem value="mixed">Blandat</SelectItem>
                    <SelectItem value="unknown">Unknown</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>Org Number</Label>
              <Input
                value={orgNumber}
                onChange={(ev) => setOrgNumber(ev.target.value)}
                placeholder="556123-4567"
                className="mt-1"
              />
            </div>

            <Button type="submit" className="w-full" disabled={!name.trim() || create.isPending}>
              {create.isPending ? "Creating..." : "Create Entity"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
