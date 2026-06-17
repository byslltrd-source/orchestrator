import { NextRequest, NextResponse } from 'next/server';
import { SharedWorkInputSchema } from '@/lib/proviso/schemas';
import { listSharedWork, addSharedWork } from '@/lib/proviso/service';
import { isAgentRequest, provisoOwnerId } from '@/lib/proviso/api';

export async function GET(request: NextRequest) {
  try {
    const userId = provisoOwnerId();
    const workDate = request.nextUrl.searchParams.get('work_date') || undefined;
    const entries = await listSharedWork(userId, workDate);
    return NextResponse.json({ entries, agent_readable: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to list shared work';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (isAgentRequest(request)) {
    return NextResponse.json(
      { error: 'Agents cannot write to Shared Work. User discipline required.' },
      { status: 403 },
    );
  }

  try {
    const userId = provisoOwnerId();
    const formData = await request.formData();
    const raw = {
      title: String(formData.get('title') || ''),
      notes: formData.get('notes') ? String(formData.get('notes')) : undefined,
      work_date: formData.get('work_date') ? String(formData.get('work_date')) : undefined,
      workflow_tags: formData.get('workflow_tags')
        ? String(formData.get('workflow_tags')).split(',').map((t) => t.trim()).filter(Boolean)
        : undefined,
    };
    const parsed = SharedWorkInputSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const file = formData.get('file');
    const result = await addSharedWork(userId, {
      ...parsed.data,
      file: file instanceof File && file.size > 0 ? file : undefined,
    });

    return NextResponse.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to add shared work';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}