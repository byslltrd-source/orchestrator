import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  validateNumber,
  listScanners,
  runScanner,
  fullScan,
  formatFootprintReport,
  healthCheck,
} from '@/lib/phoneinfoga/client';

const ScanSchema = z.object({
  phone_number: z.string().min(8).max(20),
  action: z.enum(['validate', 'list_scanners', 'run_scanner', 'full_scan', 'footprint_report', 'health']),
  scanner: z.string().optional(),
  subject_name: z.string().max(200).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = ScanSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const { phone_number, action, scanner, subject_name } = parsed.data;

    if (action === 'health') {
      const ok = await healthCheck();
      return NextResponse.json({
        healthy: ok,
        api_url: process.env.PHONEINFOGA_API_URL || 'http://localhost:5000',
      });
    }

    if (action === 'list_scanners') {
      const scanners = await listScanners();
      return NextResponse.json({ scanners });
    }

    if (action === 'validate') {
      const number = await validateNumber(phone_number);
      return NextResponse.json({ number });
    }

    if (action === 'run_scanner') {
      if (!scanner) {
        return NextResponse.json({ error: 'scanner name required' }, { status: 400 });
      }
      const result = await runScanner(scanner, phone_number);
      return NextResponse.json({ scanner, result });
    }

    if (action === 'full_scan' || action === 'footprint_report') {
      const payload = await fullScan(phone_number);
      if (action === 'footprint_report') {
        return NextResponse.json({
          report_markdown: formatFootprintReport(phone_number, payload, subject_name),
          payload,
        });
      }
      return NextResponse.json(payload);
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'PhoneInfoga scan failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}