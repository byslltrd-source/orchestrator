import { NextRequest, NextResponse } from 'next/server';
import { PermissionGrantSchema } from '@/lib/proviso/schemas';
import { createPermissionGrant } from '@/lib/proviso/service';
import { isAgentRequest, provisoOwnerId } from '@/lib/proviso/api';

export async function POST(request: NextRequest) {
  if (isAgentRequest(request)) {
    return NextResponse.json(
      { error: 'Agents cannot issue permission grants. User must approve on trusted device.' },
      { status: 403 },
    );
  }

  try {
    const body = await request.json();
    const parsed = PermissionGrantSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const result = await createPermissionGrant(provisoOwnerId(), parsed.data);
    return NextResponse.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Grant creation failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}