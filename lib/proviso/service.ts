// Copyright (c) 2026 Edward Marin. All rights reserved.

import { randomUUID } from 'crypto';
import { createServiceClient } from '@/lib/supabase/service';
import { uploadUserFile, type StoredAsset } from '@/lib/supabase/storage';
import { PROVISO_STORAGE_FOLDER } from './constants';
import type {
  ProvisoBriefcaseEntry,
  ProvisoEodBrief,
  ProvisoPermissionGrant,
  ProvisoSharedEntry,
  ProvisoVaultEntry,
} from './types';
import { createSignedGrantToken } from './permissions';
import type { PermissionGrantInput } from './schemas';
import { todayIso } from './eod';

const svc = () => createServiceClient();

export async function listSharedWork(
  userId: string,
  workDate?: string,
): Promise<ProvisoSharedEntry[]> {
  let q = (svc().from('proviso_shared_work') as any)
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (workDate) q = q.eq('work_date', workDate);

  const { data, error } = await q.limit(100);
  if (error) throw new Error(error.message);
  return (data || []) as ProvisoSharedEntry[];
}

export async function addSharedWork(
  userId: string,
  input: {
    title: string;
    notes?: string;
    work_date?: string;
    workflow_tags?: string[];
    file?: File;
  },
): Promise<{ entry: ProvisoSharedEntry; asset?: StoredAsset }> {
  const workDate = input.work_date || todayIso();
  let filePath: string | null = null;
  let fileName: string | null = null;
  let fileMime: string | null = null;
  let asset: StoredAsset | undefined;

  if (input.file) {
    asset = await uploadUserFile(userId, input.file, input.file.name);
    const safeName = asset.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const provisoPath = `${userId}/${PROVISO_STORAGE_FOLDER}/shared/${Date.now()}-${safeName}`;
    const bucket = process.env.STORAGE_BUCKET || 'orchestrator-images';
    const { error: upErr } = await (svc().storage.from(bucket) as any).upload(
      provisoPath,
      input.file,
      { upsert: false, contentType: asset.mime },
    );
    if (upErr) throw new Error(`Shared work file upload failed: ${upErr.message}`);
    filePath = provisoPath;
    fileName = asset.name;
    fileMime = asset.mime;
  }

  const { data, error } = await (svc().from('proviso_shared_work') as any)
    .insert({
      user_id: userId,
      work_date: workDate,
      title: input.title,
      notes: input.notes || null,
      file_path: filePath,
      file_name: fileName,
      file_mime: fileMime,
      workflow_tags: input.workflow_tags || [],
    })
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return { entry: data as ProvisoSharedEntry, asset };
}

export async function getBriefcase(userId: string): Promise<ProvisoBriefcaseEntry | null> {
  const { data, error } = await (svc().from('proviso_briefcase') as any)
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  const entry = data as ProvisoBriefcaseEntry;
  if (entry.session_expires_at && new Date(entry.session_expires_at).getTime() < Date.now()) {
    await clearBriefcase(userId);
    return null;
  }
  return entry;
}

export async function setBriefcase(
  userId: string,
  title: string,
  file: File,
  sessionHours = 8,
): Promise<ProvisoBriefcaseEntry> {
  await clearBriefcase(userId);
  const asset = await uploadUserFile(userId, file, file.name);
  const provisoPath = `${userId}/${PROVISO_STORAGE_FOLDER}/briefcase/${Date.now()}-${asset.name}`;
  await (svc().storage.from(process.env.STORAGE_BUCKET || 'orchestrator-images') as any).upload(
    provisoPath,
    file,
    { upsert: true, contentType: asset.mime },
  );

  const expires = new Date(Date.now() + sessionHours * 3600_000).toISOString();
  const { data, error } = await (svc().from('proviso_briefcase') as any)
    .insert({
      user_id: userId,
      title,
      file_path: provisoPath,
      file_name: asset.name,
      file_mime: asset.mime,
      session_expires_at: expires,
    })
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return data as ProvisoBriefcaseEntry;
}

export async function clearBriefcase(userId: string): Promise<void> {
  await (svc().from('proviso_briefcase') as any).delete().eq('user_id', userId);
}

export async function listVaultMetadata(userId: string): Promise<Pick<ProvisoVaultEntry, 'id' | 'title' | 'created_at' | 'updated_at'>[]> {
  const { data, error } = await (svc().from('proviso_vault') as any)
    .select('id, title, created_at, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data || [];
}

export async function getVaultCiphertext(userId: string, entryId: string): Promise<ProvisoVaultEntry | null> {
  const { data, error } = await (svc().from('proviso_vault') as any)
    .select('*')
    .eq('user_id', userId)
    .eq('id', entryId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as ProvisoVaultEntry) || null;
}

export async function storeVaultEntry(
  userId: string,
  title: string,
  ciphertext: string,
  iv: string,
  salt: string,
): Promise<ProvisoVaultEntry> {
  const { data, error } = await (svc().from('proviso_vault') as any)
    .insert({ user_id: userId, title, ciphertext, iv, salt })
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return data as ProvisoVaultEntry;
}

export async function deleteVaultEntry(userId: string, entryId: string): Promise<void> {
  const { error } = await (svc().from('proviso_vault') as any)
    .delete()
    .eq('user_id', userId)
    .eq('id', entryId);
  if (error) throw new Error(error.message);
}

/** Agent-safe context — shared work + briefcase only. */
export async function getAgentWorkContext(userId: string): Promise<string> {
  const today = todayIso();
  const [shared, briefcase] = await Promise.all([
    listSharedWork(userId, today),
    getBriefcase(userId),
  ]);

  const lines: string[] = ['=== PROVISO Agent Context (Shared + Briefcase only) ===', ''];

  lines.push(`## Shared Work (${today})`);
  if (!shared.length) lines.push('- (no entries today)');
  else {
    for (const e of shared) {
      lines.push(`- ${e.title}${e.notes ? `: ${e.notes.slice(0, 200)}` : ''}`);
    }
  }

  lines.push('', '## Briefcase (present job)');
  if (!briefcase) lines.push('- (empty)');
  else lines.push(`- ${briefcase.title} (${briefcase.file_name})`);

  lines.push('', '## Private Vault', '- ACCESS DENIED — agent cannot read vault by design.');

  return lines.join('\n');
}

export async function saveEodBrief(
  userId: string,
  workDate: string,
  briefMarkdown: string,
  entryCount: number,
): Promise<ProvisoEodBrief> {
  const { data, error } = await (svc().from('proviso_eod_briefs') as any)
    .upsert(
      {
        user_id: userId,
        work_date: workDate,
        brief_markdown: briefMarkdown,
        entry_count: entryCount,
      },
      { onConflict: 'user_id,work_date' },
    )
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return data as ProvisoEodBrief;
}

export async function getLatestEodBrief(userId: string): Promise<ProvisoEodBrief | null> {
  const { data, error } = await (svc().from('proviso_eod_briefs') as any)
    .select('*')
    .eq('user_id', userId)
    .order('work_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as ProvisoEodBrief) || null;
}

export async function createPermissionGrant(
  userId: string,
  input: PermissionGrantInput,
): Promise<{ grant: ProvisoPermissionGrant; token: string }> {
  const grantId = randomUUID();
  const { token, expires_at, payload } = createSignedGrantToken(userId, input, grantId);

  const { data, error } = await (svc().from('proviso_permission_grants') as any)
    .insert({
      id: grantId,
      user_id: userId,
      scope: payload.scope,
      target: payload.target,
      actions: payload.actions,
      expires_at,
      consumed: false,
    })
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return { grant: data as ProvisoPermissionGrant, token };
}