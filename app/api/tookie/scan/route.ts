import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  tookieHealth,
  scanUsername,
  scanAliases,
  formatFootprintReport,
} from '@/lib/tookie/client';

const ScanSchema = z.object({
  action: z.enum(['health', 'scan', 'footprint_report', 'scan_aliases']),
  username: z.string().min(1).max(64).optional(),
  aliases: z.array(z.string().min(1).max(64)).max(10).optional(),
  subject_name: z.string().max(200).optional(),
  threads: z.number().int().min(1).max(32).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = ScanSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const { action, username, aliases, subject_name, threads } = parsed.data;

    if (action === 'health') {
      const health = await tookieHealth();
      return NextResponse.json(health);
    }

    if (action === 'scan_aliases') {
      const list = aliases || (username ? username.split(',').map((s) => s.trim()) : []);
      if (!list.length) {
        return NextResponse.json({ error: 'aliases or comma-separated username required' }, { status: 400 });
      }
      const { results } = await scanAliases(list, threads);
      return NextResponse.json({ results });
    }

    if (!username) {
      return NextResponse.json({ error: 'username required' }, { status: 400 });
    }

    const payload = await scanUsername(username, threads);

    if (action === 'footprint_report') {
      return NextResponse.json({
        report_markdown: formatFootprintReport(username, payload.hits, subject_name),
        ...payload,
      });
    }

    return NextResponse.json(payload);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'TOOKIE scan failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}