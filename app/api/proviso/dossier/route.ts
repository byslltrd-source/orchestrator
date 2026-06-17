import { NextRequest, NextResponse } from 'next/server';
import { DossierCreateSchema, DossierLinkSchema } from '@/lib/proviso/schemas';
import {
  listDossiers,
  createDossier,
  linkDossiers,
  getNetworkDossier,
  deleteDossier,
  getDossier,
} from '@/lib/proviso/dossier-service';
import { provisoOwnerId } from '@/lib/proviso/api';
import type { DossierSubjectType } from '@/lib/proviso/types';

export async function GET(request: NextRequest) {
  try {
    const userId = provisoOwnerId();
    const subjectType = request.nextUrl.searchParams.get('subject_type') as DossierSubjectType | null;
    const id = request.nextUrl.searchParams.get('id');
    const network = request.nextUrl.searchParams.get('network');

    if (id && network === '1') {
      const markdown = await getNetworkDossier(userId, id);
      return NextResponse.json({ network_markdown: markdown });
    }

    if (id) {
      const dossier = await getDossier(userId, id);
      if (!dossier) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      return NextResponse.json({ dossier });
    }

    const dossiers = await listDossiers(userId, subjectType || undefined);
    return NextResponse.json({ dossiers });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Dossier list failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = provisoOwnerId();
    const body = await request.json();

    if (body.link) {
      const parsed = DossierLinkSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
      }
      const link = await linkDossiers(
        userId,
        parsed.data.from_dossier_id,
        parsed.data.to_dossier_id,
        parsed.data.relationship_type,
        parsed.data.notes,
      );
      return NextResponse.json({ link });
    }

    const parsed = DossierCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const dossier = await createDossier(userId, parsed.data, parsed.data.parent_dossier_id);
    return NextResponse.json({ dossier });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Dossier create failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    await deleteDossier(provisoOwnerId(), id);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Dossier delete failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}