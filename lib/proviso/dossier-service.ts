// Copyright (c) 2026 Edward Marin. All rights reserved.

import { createServiceClient } from '@/lib/supabase/service';
import type { CreateDossierInput } from './dossier';
import { synthesizeDossierMarkdown, formatNetworkDossier } from './dossier';
import type {
  DossierSubjectType,
  ProvisoDossier,
  ProvisoDossierLink,
} from './types';

const svc = () => createServiceClient();

export async function listDossiers(
  userId: string,
  subjectType?: DossierSubjectType,
): Promise<ProvisoDossier[]> {
  let q = (svc().from('proviso_dossiers') as any)
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });
  if (subjectType) q = q.eq('subject_type', subjectType);
  const { data, error } = await q.limit(100);
  if (error) throw new Error(error.message);
  return (data || []) as ProvisoDossier[];
}

export async function getDossier(userId: string, id: string): Promise<ProvisoDossier | null> {
  const { data, error } = await (svc().from('proviso_dossiers') as any)
    .select('*')
    .eq('user_id', userId)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as ProvisoDossier) || null;
}

export async function createDossier(
  userId: string,
  input: CreateDossierInput,
  parentDossierId?: string,
): Promise<ProvisoDossier> {
  let linked: { name: string; type: DossierSubjectType; relationship: string }[] = [];

  if (parentDossierId) {
    const parent = await getDossier(userId, parentDossierId);
    if (parent) {
      linked.push({
        name: parent.full_name,
        type: parent.subject_type,
        relationship: input.relationship_type || 'linked',
      });
      const { data: existingLinks } = await (svc().from('proviso_dossier_links') as any)
        .select('*')
        .or(`from_dossier_id.eq.${parentDossierId},to_dossier_id.eq.${parentDossierId}`);

      if (existingLinks) {
        for (const row of existingLinks as ProvisoDossierLink[]) {
          const otherId =
            row.from_dossier_id === parentDossierId ? row.to_dossier_id : row.from_dossier_id;
          const other = await getDossier(userId, otherId);
          if (other) {
            linked.push({
              name: other.full_name,
              type: other.subject_type,
              relationship: row.relationship_type,
            });
          }
        }
      }
    }
  }

  const { markdown, provenance } = await synthesizeDossierMarkdown(input, linked);

  const { data, error } = await (svc().from('proviso_dossiers') as any)
    .insert({
      user_id: userId,
      subject_type: input.subject_type,
      full_name: input.full_name,
      aliases: input.aliases || [],
      primary_organization: input.primary_organization || null,
      role_title: input.role_title || null,
      location: input.location || null,
      relationship_type: input.relationship_type || null,
      relationship_to_name: input.relationship_to_name || null,
      context_notes: input.context_notes || null,
      dossier_markdown: markdown,
      provenance,
      parent_dossier_id: parentDossierId || null,
    })
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  const dossier = data as ProvisoDossier;

  if (parentDossierId && input.relationship_type) {
    await linkDossiers(userId, parentDossierId, dossier.id, input.relationship_type, input.context_notes);
  }

  return dossier;
}

export async function linkDossiers(
  userId: string,
  fromId: string,
  toId: string,
  relationshipType: string,
  notes?: string,
): Promise<ProvisoDossierLink> {
  const { data, error } = await (svc().from('proviso_dossier_links') as any)
    .upsert(
      {
        user_id: userId,
        from_dossier_id: fromId,
        to_dossier_id: toId,
        relationship_type: relationshipType,
        notes: notes || null,
      },
      { onConflict: 'from_dossier_id,to_dossier_id' },
    )
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data as ProvisoDossierLink;
}

export async function getNetworkDossier(userId: string, primaryId: string): Promise<string> {
  const primary = await getDossier(userId, primaryId);
  if (!primary) throw new Error('Primary dossier not found');

  const { data: links, error: linkErr } = await (svc().from('proviso_dossier_links') as any)
    .select('*')
    .eq('user_id', userId)
    .or(`from_dossier_id.eq.${primaryId},to_dossier_id.eq.${primaryId}`);

  if (linkErr) throw new Error(linkErr.message);
  const linkRows = (links || []) as ProvisoDossierLink[];

  const associateIds = new Set<string>();
  for (const l of linkRows) {
    if (l.from_dossier_id !== primaryId) associateIds.add(l.from_dossier_id);
    if (l.to_dossier_id !== primaryId) associateIds.add(l.to_dossier_id);
  }

  const associates: ProvisoDossier[] = [];
  for (const id of associateIds) {
    const d = await getDossier(userId, id);
    if (d) associates.push(d);
  }

  return formatNetworkDossier(primary, associates, linkRows);
}

export async function deleteDossier(userId: string, id: string): Promise<void> {
  await (svc().from('proviso_dossier_links') as any)
    .delete()
    .or(`from_dossier_id.eq.${id},to_dossier_id.eq.${id}`);
  const { error } = await (svc().from('proviso_dossiers') as any)
    .delete()
    .eq('user_id', userId)
    .eq('id', id);
  if (error) throw new Error(error.message);
}