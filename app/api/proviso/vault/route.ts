import { NextRequest, NextResponse } from 'next/server';
import { VaultStoreSchema } from '@/lib/proviso/schemas';
import {
  listVaultMetadata,
  getVaultCiphertext,
  storeVaultEntry,
  deleteVaultEntry,
} from '@/lib/proviso/service';
import { agentAccessDenied, isAgentRequest, provisoOwnerId } from '@/lib/proviso/api';

/** Private Vault — user-only. Agent access is always denied. */
export async function GET(request: NextRequest) {
  if (isAgentRequest(request)) {
    return agentAccessDenied('private_vault');
  }

  try {
    const userId = provisoOwnerId();
    const entryId = request.nextUrl.searchParams.get('entry_id');

    if (entryId) {
      const entry = await getVaultCiphertext(userId, entryId);
      if (!entry) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      return NextResponse.json({
        entry: {
          id: entry.id,
          title: entry.title,
          ciphertext: entry.ciphertext,
          iv: entry.iv,
          salt: entry.salt,
          created_at: entry.created_at,
          updated_at: entry.updated_at,
        },
      });
    }

    const entries = await listVaultMetadata(userId);
    return NextResponse.json({ entries, agent_readable: false });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Vault error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (isAgentRequest(request)) {
    return agentAccessDenied('private_vault');
  }

  try {
    const userId = provisoOwnerId();
    const body = await request.json();
    const parsed = VaultStoreSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const entry = await storeVaultEntry(
      userId,
      parsed.data.title,
      parsed.data.ciphertext,
      parsed.data.iv,
      parsed.data.salt,
    );
    return NextResponse.json({
      entry: { id: entry.id, title: entry.title, created_at: entry.created_at },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Vault store failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  if (isAgentRequest(request)) {
    return agentAccessDenied('private_vault');
  }

  try {
    const entryId = request.nextUrl.searchParams.get('entry_id');
    if (!entryId) return NextResponse.json({ error: 'entry_id required' }, { status: 400 });
    await deleteVaultEntry(provisoOwnerId(), entryId);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Vault delete failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}