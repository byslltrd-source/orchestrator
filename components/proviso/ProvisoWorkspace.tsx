"use client";

// Copyright (c) 2026 Edward Marin. All rights reserved.

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Briefcase,
  FolderOpen,
  Lock,
  Moon,
  Shield,
  Loader2,
  FileUp,
  Trash2,
  Network,
} from "lucide-react";
import { encryptVaultPayload, decryptVaultPayload } from "@/lib/proviso/crypto";
import { PROVISO_NAME, PROVISO_TAGLINE } from "@/lib/proviso/constants";
import { ProvisoCirclPanel } from "@/components/proviso/ProvisoCirclPanel";

type SharedEntry = {
  id: string;
  title: string;
  notes: string | null;
  work_date: string;
  workflow_tags: string[];
  file_name: string | null;
};

type BriefcaseEntry = {
  id: string;
  title: string;
  file_name: string;
  session_expires_at: string | null;
};

type VaultMeta = { id: string; title: string; created_at: string };

export function ProvisoWorkspace() {
  const [tab, setTab] = useState<"shared" | "briefcase" | "vault" | "eod" | "circl">("shared");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [shared, setShared] = useState<SharedEntry[]>([]);
  const [briefcase, setBriefcase] = useState<BriefcaseEntry | null>(null);
  const [vaultList, setVaultList] = useState<VaultMeta[]>([]);
  const [eodBrief, setEodBrief] = useState<string | null>(null);

  const [sharedTitle, setSharedTitle] = useState("");
  const [sharedNotes, setSharedNotes] = useState("");
  const [sharedFile, setSharedFile] = useState<File | null>(null);

  const [briefTitle, setBriefTitle] = useState("");
  const [briefFile, setBriefFile] = useState<File | null>(null);

  const [vaultTitle, setVaultTitle] = useState("");
  const [vaultContent, setVaultContent] = useState("");
  const [vaultPassword, setVaultPassword] = useState("");
  const [vaultDecrypt, setVaultDecrypt] = useState("");

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const [sRes, bRes, vRes, eRes] = await Promise.all([
        fetch("/api/proviso/shared"),
        fetch("/api/proviso/briefcase"),
        fetch("/api/proviso/vault"),
        fetch("/api/proviso/eod"),
      ]);
      if (sRes.ok) {
        const s = await sRes.json();
        setShared(s.entries || []);
      }
      if (bRes.ok) {
        const b = await bRes.json();
        setBriefcase(b.entry || null);
      }
      if (vRes.ok) {
        const v = await vRes.json();
        setVaultList(v.entries || []);
      }
      if (eRes.ok) {
        const e = await eRes.json();
        setEodBrief(e.brief?.brief_markdown || null);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load PROVISO");
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function submitShared() {
    if (!sharedTitle.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("title", sharedTitle);
      if (sharedNotes) fd.append("notes", sharedNotes);
      if (sharedFile) fd.append("file", sharedFile);
      const res = await fetch("/api/proviso/shared", { method: "POST", body: fd });
      if (!res.ok) throw new Error((await res.json()).error || "Upload failed");
      setSharedTitle("");
      setSharedNotes("");
      setSharedFile(null);
      await refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Shared work failed");
    } finally {
      setLoading(false);
    }
  }

  async function submitBriefcase() {
    if (!briefTitle.trim() || !briefFile) return;
    setLoading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("title", briefTitle);
      fd.append("file", briefFile);
      const res = await fetch("/api/proviso/briefcase", { method: "POST", body: fd });
      if (!res.ok) throw new Error((await res.json()).error || "Briefcase failed");
      setBriefTitle("");
      setBriefFile(null);
      await refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Briefcase failed");
    } finally {
      setLoading(false);
    }
  }

  async function storeVault() {
    if (!vaultTitle.trim() || !vaultContent.trim() || !vaultPassword) return;
    setLoading(true);
    setError(null);
    try {
      const enc = await encryptVaultPayload(vaultContent, vaultPassword);
      const res = await fetch("/api/proviso/vault", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: vaultTitle, ...enc }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Vault store failed");
      setVaultTitle("");
      setVaultContent("");
      setVaultPassword("");
      await refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Vault failed");
    } finally {
      setLoading(false);
    }
  }

  async function unlockVault(entryId: string) {
    if (!vaultPassword) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/proviso/vault?entry_id=${entryId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Load failed");
      const plain = await decryptVaultPayload(
        data.entry.ciphertext,
        data.entry.iv,
        data.entry.salt,
        vaultPassword,
      );
      setVaultDecrypt(plain);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Wrong password or corrupt entry");
      setVaultDecrypt("");
    } finally {
      setLoading(false);
    }
  }

  async function generateEod() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/proviso/eod", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "EOD failed");
      setEodBrief(data.brief?.brief_markdown || null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "EOD failed");
    } finally {
      setLoading(false);
    }
  }

  const tabs = [
    { id: "shared" as const, label: "Shared Work", icon: FolderOpen },
    { id: "briefcase" as const, label: "Briefcase", icon: Briefcase },
    { id: "vault" as const, label: "Private Vault", icon: Lock },
    { id: "eod" as const, label: "EOD Brief", icon: Moon },
    { id: "circl" as const, label: "CIRCL Dossiers", icon: Network },
  ];

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-950/30 to-zinc-950 p-6">
        <div className="flex items-center gap-3 mb-2">
          <Shield className="h-8 w-8 text-amber-400" />
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-amber-100">{PROVISO_NAME}</h1>
            <p className="text-sm text-amber-200/70">{PROVISO_TAGLINE}</p>
          </div>
        </div>
        <p className="text-xs text-zinc-400 max-w-2xl">
          Proprietary Orchestrator workspace. Agent reads Shared Work + Briefcase only. Private Vault is
          password-encrypted and permanently agent-blocked.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map(({ id, label, icon: Icon }) => (
          <Button
            key={id}
            variant={tab === id ? "default" : "outline"}
            className={tab === id ? "bg-amber-600 hover:bg-amber-500" : "border-white/10"}
            onClick={() => setTab(id)}
          >
            <Icon className="h-4 w-4 mr-2" />
            {label}
          </Button>
        ))}
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-950/30 px-4 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      {tab === "shared" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="border-white/10 bg-zinc-950/80">
            <CardHeader>
              <CardTitle>Drop today&apos;s work</CardTitle>
              <CardDescription>End-of-day discipline — agent learns your workflow from here.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <input
                className="w-full rounded-md border border-white/10 bg-zinc-900 px-3 py-2 text-sm"
                placeholder="Title (e.g. Acme contract redlines)"
                value={sharedTitle}
                onChange={(e) => setSharedTitle(e.target.value)}
              />
              <Textarea
                placeholder="Notes (optional)"
                value={sharedNotes}
                onChange={(e) => setSharedNotes(e.target.value)}
                className="min-h-[80px] border-white/10 bg-zinc-900"
              />
              <label className="flex items-center gap-2 text-sm text-zinc-400 cursor-pointer">
                <FileUp className="h-4 w-4" />
                <input type="file" className="text-xs" onChange={(e) => setSharedFile(e.target.files?.[0] || null)} />
              </label>
              <Button onClick={submitShared} disabled={loading} className="bg-amber-600 hover:bg-amber-500">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add to Shared Work"}
              </Button>
            </CardContent>
          </Card>
          <Card className="border-white/10 bg-zinc-950/80">
            <CardHeader>
              <CardTitle>Today&apos;s shared entries</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 max-h-80 overflow-y-auto">
              {shared.length === 0 && <p className="text-sm text-zinc-500">No entries yet.</p>}
              {shared.map((e) => (
                <div key={e.id} className="rounded-lg border border-white/5 p-3 text-sm">
                  <div className="font-medium text-amber-100">{e.title}</div>
                  {e.notes && <p className="text-zinc-400 mt-1">{e.notes}</p>}
                  {e.file_name && <p className="text-xs text-zinc-500 mt-1">📎 {e.file_name}</p>}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {tab === "briefcase" && (
        <Card className="border-white/10 bg-zinc-950/80 max-w-xl">
          <CardHeader>
            <CardTitle>Briefcase — one file for the present job</CardTitle>
            <CardDescription>Meeting, flight, or live moment. Agent access limited to this file.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {briefcase ? (
              <div className="rounded-lg border border-amber-500/30 p-4">
                <p className="font-medium text-amber-100">{briefcase.title}</p>
                <p className="text-sm text-zinc-400">{briefcase.file_name}</p>
                {briefcase.session_expires_at && (
                  <p className="text-xs text-zinc-500 mt-2">
                    Session expires: {new Date(briefcase.session_expires_at).toLocaleString()}
                  </p>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 border-red-500/30 text-red-300"
                  onClick={async () => {
                    await fetch("/api/proviso/briefcase", { method: "DELETE" });
                    refresh();
                  }}
                >
                  <Trash2 className="h-3 w-3 mr-1" /> Clear briefcase
                </Button>
              </div>
            ) : (
              <>
                <input
                  className="w-full rounded-md border border-white/10 bg-zinc-900 px-3 py-2 text-sm"
                  placeholder="Job title"
                  value={briefTitle}
                  onChange={(e) => setBriefTitle(e.target.value)}
                />
                <input type="file" onChange={(e) => setBriefFile(e.target.files?.[0] || null)} />
                <Button onClick={submitBriefcase} disabled={loading || !briefFile} className="bg-amber-600 hover:bg-amber-500">
                  Attach to Briefcase
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {tab === "vault" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="border-white/10 bg-zinc-950/80">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lock className="h-5 w-5 text-red-400" /> Private Vault
              </CardTitle>
              <CardDescription>Encrypted client-side. Agent cannot access — ever.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <input
                className="w-full rounded-md border border-white/10 bg-zinc-900 px-3 py-2 text-sm"
                placeholder="Entry title"
                value={vaultTitle}
                onChange={(e) => setVaultTitle(e.target.value)}
              />
              <Textarea
                placeholder="Private content (never shared with agent)"
                value={vaultContent}
                onChange={(e) => setVaultContent(e.target.value)}
                className="min-h-[100px] border-white/10 bg-zinc-900"
              />
              <input
                type="password"
                className="w-full rounded-md border border-white/10 bg-zinc-900 px-3 py-2 text-sm"
                placeholder="Vault password"
                value={vaultPassword}
                onChange={(e) => setVaultPassword(e.target.value)}
              />
              <Button onClick={storeVault} disabled={loading} className="bg-zinc-700 hover:bg-zinc-600">
                Encrypt &amp; Store
              </Button>
            </CardContent>
          </Card>
          <Card className="border-white/10 bg-zinc-950/80">
            <CardHeader>
              <CardTitle>Unlock entry</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {vaultList.map((v) => (
                <div key={v.id} className="flex items-center justify-between rounded border border-white/5 p-2 text-sm">
                  <span>{v.title}</span>
                  <Button size="sm" variant="outline" onClick={() => unlockVault(v.id)}>
                    Unlock
                  </Button>
                </div>
              ))}
              {vaultDecrypt && (
                <pre className="mt-3 rounded bg-zinc-900 p-3 text-xs text-zinc-300 whitespace-pre-wrap max-h-48 overflow-auto">
                  {vaultDecrypt}
                </pre>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {tab === "circl" && <ProvisoCirclPanel />}

      {tab === "eod" && (
        <Card className="border-white/10 bg-zinc-950/80">
          <CardHeader>
            <CardTitle>End-of-Day Brief</CardTitle>
            <CardDescription>Generate from today&apos;s Shared Work. Run this discipline every close.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button onClick={generateEod} disabled={loading} className="bg-amber-600 hover:bg-amber-500">
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Moon className="h-4 w-4 mr-2" />}
              Generate EOD Brief
            </Button>
            {eodBrief && (
              <pre className="rounded-lg border border-white/10 bg-zinc-900 p-4 text-sm text-zinc-300 whitespace-pre-wrap max-h-96 overflow-y-auto">
                {eodBrief}
              </pre>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}