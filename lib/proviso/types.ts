// Copyright (c) 2026 Edward Marin. All rights reserved.

import type { StoredAsset } from '@/lib/supabase/storage';

export interface ProvisoSharedEntry {
  id: string;
  user_id: string;
  work_date: string;
  title: string;
  notes: string | null;
  file_path: string | null;
  file_name: string | null;
  file_mime: string | null;
  workflow_tags: string[];
  created_at: string;
}

export interface ProvisoBriefcaseEntry {
  id: string;
  user_id: string;
  title: string;
  file_path: string;
  file_name: string;
  file_mime: string;
  session_expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProvisoVaultEntry {
  id: string;
  user_id: string;
  title: string;
  ciphertext: string;
  iv: string;
  salt: string;
  created_at: string;
  updated_at: string;
}

export interface ProvisoEodBrief {
  id: string;
  user_id: string;
  work_date: string;
  brief_markdown: string;
  entry_count: number;
  created_at: string;
}

export interface ProvisoPermissionGrant {
  id: string;
  user_id: string;
  scope: 'single_file' | 'folder' | 'search';
  target: string;
  actions: string[];
  expires_at: string;
  consumed: boolean;
  created_at: string;
}

export interface ProvisoSharedEntryWithAsset extends ProvisoSharedEntry {
  asset?: StoredAsset | null;
}

export type DossierSubjectType = 'corporate_officer' | 'associate' | 'organization';

export const DOSSIER_RELATIONSHIP_TYPES = [
  'confidant',
  'business_partner',
  'co_founder',
  'board_peer',
  'family',
  'legal_co_party',
  'vendor_contact',
  'advisor',
  'employee',
  'investor',
  'other',
] as const;

export type DossierRelationshipType = (typeof DOSSIER_RELATIONSHIP_TYPES)[number];

export interface ProvisoDossier {
  id: string;
  user_id: string;
  subject_type: DossierSubjectType;
  full_name: string;
  aliases: string[];
  primary_organization: string | null;
  role_title: string | null;
  location: string | null;
  relationship_type: string | null;
  relationship_to_name: string | null;
  context_notes: string | null;
  dossier_markdown: string;
  provenance: string[];
  parent_dossier_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProvisoDossierLink {
  id: string;
  user_id: string;
  from_dossier_id: string;
  to_dossier_id: string;
  relationship_type: string;
  notes: string | null;
  created_at: string;
}

export interface EodBriefSections {
  headline: string;
  completed_today: string[];
  still_open: string[];
  connections: string[];
  tomorrow_focus: string[];
  discipline_note: string;
}