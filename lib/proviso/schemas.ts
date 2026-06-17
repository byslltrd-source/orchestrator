import { z } from 'zod';

export const SharedWorkInputSchema = z.object({
  title: z.string().min(1).max(200),
  notes: z.string().max(8000).optional(),
  work_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  workflow_tags: z.array(z.string().max(50)).max(10).optional(),
});

export const BriefcaseSetSchema = z.object({
  title: z.string().min(1).max(200),
  session_hours: z.number().int().min(1).max(72).optional(),
});

export const VaultStoreSchema = z.object({
  title: z.string().min(1).max(200),
  ciphertext: z.string().min(1),
  iv: z.string().min(1),
  salt: z.string().min(1),
});

export const VaultUnlockSchema = z.object({
  entry_id: z.string().uuid(),
});

export const PermissionGrantSchema = z.object({
  scope: z.enum(['single_file', 'folder', 'search']),
  target: z.string().min(1).max(500),
  actions: z.array(z.enum(['read', 'fetch', 'email_draft'])).min(1).max(3),
  ttl_minutes: z.number().int().min(5).max(120).optional(),
});

export const EodGenerateSchema = z.object({
  work_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export type SharedWorkInput = z.infer<typeof SharedWorkInputSchema>;
export type BriefcaseSetInput = z.infer<typeof BriefcaseSetSchema>;
export type VaultStoreInput = z.infer<typeof VaultStoreSchema>;
export type PermissionGrantInput = z.infer<typeof PermissionGrantSchema>;

export const DossierCreateSchema = z.object({
  subject_type: z.enum(['corporate_officer', 'associate', 'organization']),
  full_name: z.string().min(2).max(200),
  aliases: z.array(z.string().max(100)).max(10).optional(),
  primary_organization: z.string().max(200).optional(),
  role_title: z.string().max(200).optional(),
  location: z.string().max(200).optional(),
  relationship_type: z.string().max(100).optional(),
  relationship_to_name: z.string().max(200).optional(),
  context_notes: z.string().max(12000).optional(),
  research_query: z.string().max(500).optional(),
  parent_dossier_id: z.string().uuid().optional(),
});

export const DossierLinkSchema = z.object({
  from_dossier_id: z.string().uuid(),
  to_dossier_id: z.string().uuid(),
  relationship_type: z.string().min(1).max(100),
  notes: z.string().max(2000).optional(),
});

export type DossierCreateInput = z.infer<typeof DossierCreateSchema>;
export type DossierLinkInput = z.infer<typeof DossierLinkSchema>;