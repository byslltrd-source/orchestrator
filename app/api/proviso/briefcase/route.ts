import { NextRequest, NextResponse } from 'next/server';
import { BriefcaseSetSchema } from '@/lib/proviso/schemas';
import { getBriefcase, setBriefcase, clearBriefcase } from '@/lib/proviso/service';
import { isAgentRequest, provisoOwnerId } from '@/lib/proviso/api';

export async function GET() {
  try {
    const entry = await getBriefcase(provisoOwnerId());
    return NextResponse.json({ entry, agent_readable: true, max_files: 1 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to read briefcase';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (isAgentRequest(request)) {
    return NextResponse.json(
      { error: 'Agents cannot set Briefcase. User must attach the present-job file.' },
      { status: 403 },
    );
  }

  try {
    const userId = provisoOwnerId();
    const formData = await request.formData();
    const parsed = BriefcaseSetSchema.safeParse({
      title: String(formData.get('title') || ''),
      session_hours: formData.get('session_hours')
        ? Number(formData.get('session_hours'))
        : undefined,
    });
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const file = formData.get('file');
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: 'Briefcase requires exactly one file' }, { status: 400 });
    }

    const entry = await setBriefcase(
      userId,
      parsed.data.title,
      file,
      parsed.data.session_hours ?? 8,
    );
    return NextResponse.json({ entry });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to set briefcase';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  if (isAgentRequest(request)) {
    return NextResponse.json({ error: 'Agents cannot clear Briefcase' }, { status: 403 });
  }
  try {
    await clearBriefcase(provisoOwnerId());
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to clear briefcase';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}