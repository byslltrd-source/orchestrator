import { NextRequest, NextResponse } from 'next/server';
import { EodGenerateSchema } from '@/lib/proviso/schemas';
import { generateEodBriefMarkdown, todayIso } from '@/lib/proviso/eod';
import { listSharedWork, saveEodBrief, getLatestEodBrief } from '@/lib/proviso/service';
import { provisoOwnerId } from '@/lib/proviso/api';

export async function GET() {
  try {
    const brief = await getLatestEodBrief(provisoOwnerId());
    return NextResponse.json({ brief });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to load EOD brief';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = provisoOwnerId();
    const body = await request.json().catch(() => ({}));
    const parsed = EodGenerateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const workDate = parsed.data.work_date || todayIso();
    const entries = await listSharedWork(userId, workDate);
    const briefMarkdown = await generateEodBriefMarkdown(workDate, entries);
    const saved = await saveEodBrief(userId, workDate, briefMarkdown, entries.length);

    return NextResponse.json({ brief: saved });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'EOD generation failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}