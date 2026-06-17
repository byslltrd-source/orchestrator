"use client";

// Copyright (c) 2026 Edward Marin. All rights reserved.

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { PROVISO_CIRCL_NAME } from "@/lib/proviso/constants";
import { Users, UserCircle, Building2, Loader2, Network, Trash2 } from "lucide-react";

type DossierRow = {
  id: string;
  subject_type: string;
  full_name: string;
  primary_organization: string | null;
  relationship_type: string | null;
  relationship_to_name: string | null;
  dossier_markdown: string;
};

const SUBJECT_TYPES = [
  { id: "corporate_officer", label: "Corporate Officer", icon: UserCircle },
  { id: "associate", label: "Associate", icon: Users },
  { id: "organization", label: "Organization", icon: Building2 },
] as const;

const RELATIONSHIPS = [
  "confidant",
  "business_partner",
  "co_founder",
  "board_peer",
  "family",
  "legal_co_party",
  "vendor_contact",
  "advisor",
  "employee",
  "investor",
  "other",
];

export function ProvisoCirclPanel() {
  const [dossiers, setDossiers] = useState<DossierRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [networkMd, setNetworkMd] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [subjectType, setSubjectType] = useState<string>("corporate_officer");
  const [fullName, setFullName] = useState("");
  const [organization, setOrganization] = useState("");
  const [roleTitle, setRoleTitle] = useState("");
  const [location, setLocation] = useState("");
  const [relationshipType, setRelationshipType] = useState("confidant");
  const [relationshipTo, setRelationshipTo] = useState("");
  const [parentId, setParentId] = useState("");
  const [contextNotes, setContextNotes] = useState("");

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/proviso/dossier");
      if (!res.ok) throw new Error((await res.json()).error || "Load failed");
      const data = await res.json();
      setDossiers(data.dossiers || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load dossiers");
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function createDossier() {
    if (!fullName.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/proviso/dossier", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject_type: subjectType,
          full_name: fullName,
          primary_organization: organization || undefined,
          role_title: roleTitle || undefined,
          location: location || undefined,
          relationship_type: subjectType === "associate" ? relationshipType : undefined,
          relationship_to_name: relationshipTo || undefined,
          context_notes: contextNotes || undefined,
          parent_dossier_id: parentId || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || data.error || "Create failed");
      setFullName("");
      setContextNotes("");
      setSelectedId(data.dossier?.id || null);
      await refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Create dossier failed");
    } finally {
      setLoading(false);
    }
  }

  async function loadNetwork(id: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/proviso/dossier?id=${id}&network=1`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Network failed");
      setNetworkMd(data.network_markdown || null);
      setSelectedId(id);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Network dossier failed");
    } finally {
      setLoading(false);
    }
  }

  async function removeDossier(id: string) {
    setLoading(true);
    await fetch(`/api/proviso/dossier?id=${id}`, { method: "DELETE" });
    if (selectedId === id) {
      setSelectedId(null);
      setNetworkMd(null);
    }
    await refresh();
    setLoading(false);
  }

  const selected = dossiers.find((d) => d.id === selectedId);
  const officers = dossiers.filter((d) => d.subject_type === "corporate_officer");
  const hasConfidant = dossiers.some(
    (d) => d.subject_type === "associate" && d.relationship_type === "confidant",
  );

  return (
    <div className="space-y-4">
      <Card className="border-amber-500/20 bg-zinc-950/80">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-amber-200">
            <Network className="h-5 w-5" />
            {PROVISO_CIRCL_NAME}
          </CardTitle>
          <CardDescription>
            Corporate & Relational Intelligence — dossiers on officers, associates, and organizations.
            Everyone has a confidant: map the inner circle first, then build the full associate ring.
          </CardDescription>
        </CardHeader>
      </Card>

      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-950/30 px-4 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-white/10 bg-zinc-950/80">
          <CardHeader>
            <CardTitle className="text-base">Create dossier</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {SUBJECT_TYPES.map(({ id, label, icon: Icon }) => (
                <Button
                  key={id}
                  size="sm"
                  variant={subjectType === id ? "default" : "outline"}
                  className={subjectType === id ? "bg-amber-600" : "border-white/10"}
                  onClick={() => setSubjectType(id)}
                >
                  <Icon className="h-3 w-3 mr-1" />
                  {label}
                </Button>
              ))}
            </div>
            <input
              className="w-full rounded-md border border-white/10 bg-zinc-900 px-3 py-2 text-sm"
              placeholder="Full name *"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
            <input
              className="w-full rounded-md border border-white/10 bg-zinc-900 px-3 py-2 text-sm"
              placeholder="Organization"
              value={organization}
              onChange={(e) => setOrganization(e.target.value)}
            />
            <input
              className="w-full rounded-md border border-white/10 bg-zinc-900 px-3 py-2 text-sm"
              placeholder="Role / title"
              value={roleTitle}
              onChange={(e) => setRoleTitle(e.target.value)}
            />
            <input
              className="w-full rounded-md border border-white/10 bg-zinc-900 px-3 py-2 text-sm"
              placeholder="Location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
            {subjectType === "associate" && (
              <>
                <select
                  className="w-full rounded-md border border-white/10 bg-zinc-900 px-3 py-2 text-sm"
                  value={relationshipType}
                  onChange={(e) => setRelationshipType(e.target.value)}
                >
                  {RELATIONSHIPS.map((r) => (
                    <option key={r} value={r}>
                      {r.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
                <input
                  className="w-full rounded-md border border-white/10 bg-zinc-900 px-3 py-2 text-sm"
                  placeholder="Related to (officer name)"
                  value={relationshipTo}
                  onChange={(e) => setRelationshipTo(e.target.value)}
                />
                <select
                  className="w-full rounded-md border border-white/10 bg-zinc-900 px-3 py-2 text-sm"
                  value={parentId}
                  onChange={(e) => setParentId(e.target.value)}
                >
                  <option value="">Link to officer dossier (optional)</option>
                  {officers.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.full_name}
                    </option>
                  ))}
                </select>
              </>
            )}
            <Textarea
              placeholder="Public context / notes for synthesis"
              value={contextNotes}
              onChange={(e) => setContextNotes(e.target.value)}
              className="min-h-[80px] border-white/10 bg-zinc-900"
            />
            <Button
              onClick={createDossier}
              disabled={loading || !fullName.trim()}
              className="bg-amber-600 hover:bg-amber-500"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Generate dossier"}
            </Button>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-zinc-950/80">
          <CardHeader>
            <CardTitle className="text-base">Dossier library</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 max-h-96 overflow-y-auto">
            {dossiers.length === 0 && (
              <p className="text-sm text-zinc-500">
                No dossiers yet. Create an officer, then add their confidant as the first associate.
              </p>
            )}
            {officers.length > 0 && !hasConfidant && (
              <p className="text-sm text-amber-400/80 mb-2">
                Confidant layer unmapped — pick relationship <strong>confidant</strong> when adding the inner circle.
              </p>
            )}
            {dossiers.map((d) => (
              <div
                key={d.id}
                className={`rounded-lg border p-3 text-sm cursor-pointer transition-colors ${
                  selectedId === d.id ? "border-amber-500/50 bg-amber-950/20" : "border-white/5 hover:border-white/15"
                }`}
                onClick={() => {
                  setSelectedId(d.id);
                  setNetworkMd(null);
                }}
              >
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <div className="font-medium text-amber-100">{d.full_name}</div>
                    <div className="text-xs text-zinc-500 capitalize">
                      {d.subject_type.replace(/_/g, " ")}
                      {d.relationship_to_name ? ` · → ${d.relationship_to_name}` : ""}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs border-white/10"
                      onClick={(e) => {
                        e.stopPropagation();
                        loadNetwork(d.id);
                      }}
                    >
                      Ring
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 border-red-500/30 text-red-400"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeDossier(d.id);
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {(selected || networkMd) && (
        <Card className="border-white/10 bg-zinc-950/80">
          <CardHeader>
            <CardTitle className="text-base">
              {networkMd ? "Network dossier (Associate Ring)" : `Dossier — ${selected?.full_name}`}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="rounded-lg border border-white/10 bg-zinc-900 p-4 text-xs text-zinc-300 whitespace-pre-wrap max-h-[32rem] overflow-y-auto">
              {networkMd || selected?.dossier_markdown}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}