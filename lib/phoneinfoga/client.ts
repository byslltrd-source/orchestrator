// Copyright (c) 2026 Edward Marin. All rights reserved.
// Orchestrator wrapper for self-hosted PhoneInfoga REST API (GPL-3.0 engine).

const DEFAULT_BASE = 'http://localhost:5000';

export function phoneinfogaBaseUrl(): string {
  return (process.env.PHONEINFOGA_API_URL || DEFAULT_BASE).replace(/\/$/, '');
}

export function isPhoneinfogaConfigured(): boolean {
  return Boolean(process.env.PHONEINFOGA_API_URL || process.env.PHONEINFOGA_ENABLED === 'true');
}

async function piFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const base = phoneinfogaBaseUrl();
  const res = await fetch(`${base}/api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`PhoneInfoga ${path} failed (${res.status}): ${text.slice(0, 300)}`);
  }
  return res.json() as Promise<T>;
}

export type NumberInfo = {
  valid: boolean;
  e164?: string;
  international?: string;
  local?: string;
  country?: string;
  countryCode?: number;
  carrier?: string;
};

export async function validateNumber(phoneNumber: string): Promise<NumberInfo> {
  return piFetch<NumberInfo>('/v2/numbers', {
    method: 'POST',
    body: JSON.stringify({ number: phoneNumber }),
  });
}

export async function listScanners(): Promise<{ name: string; description: string }[]> {
  const data = await piFetch<{ scanners: { name: string; description: string }[] }>('/v2/scanners');
  return data.scanners || [];
}

export async function runScanner(
  scannerName: string,
  phoneNumber: string,
  options: Record<string, unknown> = {},
): Promise<unknown> {
  const data = await piFetch<{ result: unknown }>(`/v2/scanners/${encodeURIComponent(scannerName)}/run`, {
    method: 'POST',
    body: JSON.stringify({ number: phoneNumber, options }),
  });
  return data.result;
}

export async function fullScan(phoneNumber: string): Promise<{
  number: NumberInfo;
  scanners: { name: string; result: unknown; error?: string }[];
}> {
  const number = await validateNumber(phoneNumber);
  const scanners = await listScanners();
  const results: { name: string; result: unknown; error?: string }[] = [];

  for (const s of scanners) {
    try {
      const result = await runScanner(s.name, phoneNumber);
      results.push({ name: s.name, result });
    } catch (e: unknown) {
      results.push({
        name: s.name,
        result: null,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return { number, scanners: results };
}

export function formatFootprintReport(
  phoneNumber: string,
  payload: Awaited<ReturnType<typeof fullScan>>,
  subjectName?: string,
): string {
  const lines = [
    '# PHONEINFOGA Footprint Report',
    '',
    subjectName ? `**Subject:** ${subjectName}` : '',
    `**Input:** ${phoneNumber}`,
    `**E.164:** ${payload.number.e164 || '(n/a)'}`,
    `**Valid:** ${payload.number.valid}`,
    payload.number.carrier ? `**Carrier:** ${payload.number.carrier}` : '',
    payload.number.country ? `**Country:** ${payload.number.country}` : '',
    '',
    '## Scanner Results',
  ].filter(Boolean);

  for (const s of payload.scanners) {
    lines.push(`### ${s.name}`);
    if (s.error) lines.push(`Error: ${s.error}`);
    else lines.push('```json', JSON.stringify(s.result, null, 2).slice(0, 4000), '```');
    lines.push('');
  }

  lines.push(
    '## Discipline Note',
    'Public OSINT only. Attach to PROVISO CIRCL associate/confidant dossier when lawful.',
    '**Confidence:** Verify all links manually before action.',
  );

  return lines.join('\n');
}

export async function healthCheck(): Promise<boolean> {
  try {
    const data = await piFetch<{ success?: boolean }>('/');
    return data.success === true;
  } catch {
    return false;
  }
}