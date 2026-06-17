import { describe, it, expect } from 'vitest';
import {
  SharedWorkInputSchema,
  BriefcaseSetSchema,
  VaultStoreSchema,
  PermissionGrantSchema,
  DossierCreateSchema,
} from './schemas';

describe('PROVISO schemas', () => {
  it('accepts valid shared work input', () => {
    const r = SharedWorkInputSchema.safeParse({
      title: 'Acme contract',
      notes: 'Redlines done',
      work_date: '2026-06-16',
    });
    expect(r.success).toBe(true);
  });

  it('rejects empty briefcase title', () => {
    const r = BriefcaseSetSchema.safeParse({ title: '' });
    expect(r.success).toBe(false);
  });

  it('requires vault ciphertext fields', () => {
    const r = VaultStoreSchema.safeParse({ title: 'Secret', ciphertext: 'x', iv: 'y', salt: 'z' });
    expect(r.success).toBe(true);
  });

  it('accepts associate dossier with parent link', () => {
    const r = DossierCreateSchema.safeParse({
      subject_type: 'associate',
      full_name: 'Roberto Isaac',
      relationship_type: 'legal_co_party',
      relationship_to_name: 'Manuel Marin',
      parent_dossier_id: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(r.success).toBe(true);
  });

  it('validates permission grant actions', () => {
    const r = PermissionGrantSchema.safeParse({
      scope: 'single_file',
      target: '/docs/contract.pdf',
      actions: ['read', 'fetch'],
      ttl_minutes: 15,
    });
    expect(r.success).toBe(true);
  });
});