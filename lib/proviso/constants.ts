// Copyright (c) 2026 Edward Marin. All rights reserved.
// PROVISO — Proprietary Virtual Intelligence & Structured Operations

export const PROVISO_NAME = 'PROVISO';
export const PROVISO_TAGLINE =
  'Disciplined work. Agent-assisted. Yours alone when it must be.';

export const PROVISO_ZONES = {
  SHARED: 'shared_work',
  BRIEFCASE: 'briefcase',
  VAULT: 'private_vault',
} as const;

export type ProvisoZone = (typeof PROVISO_ZONES)[keyof typeof PROVISO_ZONES];

/** Agent may only access shared work + briefcase — never vault. */
export const AGENT_ALLOWED_ZONES: ProvisoZone[] = [
  PROVISO_ZONES.SHARED,
  PROVISO_ZONES.BRIEFCASE,
];

export const BRIEFCASE_MAX_FILES = 1;
export const DEFAULT_GRANT_TTL_MINUTES = 15;
export const PROVISO_STORAGE_FOLDER = 'proviso';

/** Corporate & Relational Intelligence Context Layer — dossiers on officers + associates */
export const PROVISO_CIRCL_NAME = 'PROVISO CIRCL';

export const DOSSIER_SUBJECT_TYPES = [
  'corporate_officer',
  'associate',
  'organization',
] as const;

/** Every officer has a confidant — CIRCL treats this as the highest-signal associate link. */
export const CIRCL_CONFIDANT_RELATIONSHIP = 'confidant' as const;