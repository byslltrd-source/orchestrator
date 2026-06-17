// Copyright (c) 2026 Edward Marin. All rights reserved.
// Orchestrator wrapper for Tookie-OSINT CLI (brib.py)

import { spawn } from 'child_process';
import { readFile, unlink } from 'fs/promises';
import path from 'path';

export type TookieHit = {
  url: string;
  found: boolean;
  status: number | null;
};

function sanitizeFilename(user: string): string {
  let safe = user.replace(/[^A-Za-z0-9._-]/g, '_').replace(/\.\./g, '_').replace(/^\.+/, '');
  if (!safe) safe = 'output';
  return safe.slice(0, 128);
}

export function tookieRoot(): string {
  const root = process.env.TOOKIE_ROOT;
  if (!root) throw new Error('TOOKIE_ROOT not set. Clone tookie-osint and set path in .env.local');
  return root;
}

export function tookiePython(): string {
  return process.env.TOOKIE_PYTHON || 'python3';
}

export async function tookieHealth(): Promise<{
  ok: boolean;
  root: string;
  python: string;
  script: string;
  message: string;
}> {
  try {
    const root = tookieRoot();
    const script = path.join(root, 'brib.py');
    const { access } = await import('fs/promises');
    await access(script);
    return {
      ok: true,
      root,
      python: tookiePython(),
      script,
      message: 'TOOKIE engine paths verified',
    };
  } catch (e: unknown) {
    return {
      ok: false,
      root: process.env.TOOKIE_ROOT || '',
      python: tookiePython(),
      script: '',
      message: e instanceof Error ? e.message : 'TOOKIE not configured',
    };
  }
}

function runTookieCli(
  username: string,
  threads: number,
): Promise<{ stdout: string; stderr: string; code: number }> {
  const root = tookieRoot();
  const python = tookiePython();
  const script = path.join(root, 'brib.py');

  return new Promise((resolve, reject) => {
    const args = ['-u', username, '-o', 'json', '-t', String(threads), '--skipheaders'];
    const child = spawn(python, [script, ...args], {
      cwd: root,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PYTHONUNBUFFERED: '1' },
    });

    // Decline interactive headers.txt download if prompted
    child.stdin?.write('n\n');
    child.stdin?.end();

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });

    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error('TOOKIE scan timed out after 180s'));
    }, 180_000);

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code: code ?? 1 });
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

export async function scanUsername(
  username: string,
  threads = Number(process.env.TOOKIE_DEFAULT_THREADS || 8),
): Promise<{ username: string; hits: TookieHit[]; raw_log?: string }> {
  const root = tookieRoot();
  const safe = sanitizeFilename(username);
  const jsonPath = path.join(root, `${safe}.json`);

  const { stdout, stderr, code } = await runTookieCli(username, threads);

  try {
    const raw = await readFile(jsonPath, 'utf8');
    const hits = JSON.parse(raw) as TookieHit[];
    await unlink(jsonPath).catch(() => {});
    return {
      username,
      hits: Array.isArray(hits) ? hits.filter((h) => h.found) : [],
      raw_log: code !== 0 ? stderr || stdout : undefined,
    };
  } catch {
    if (code !== 0) {
      throw new Error(`TOOKIE scan failed (exit ${code}): ${(stderr || stdout).slice(0, 500)}`);
    }
    return { username, hits: [], raw_log: stdout.slice(0, 1000) };
  }
}

export function formatFootprintReport(
  username: string,
  hits: TookieHit[],
  subjectName?: string,
): string {
  const lines = [
    '# TOOKIE Social Footprint Report',
    '',
    subjectName ? `**CIRCL subject:** ${subjectName}` : '',
    `**Username scanned:** ${username}`,
    `**Confirmed public hits:** ${hits.length}`,
    '',
    '## Accounts Found (public URLs)',
  ].filter(Boolean);

  if (!hits.length) {
    lines.push('- No positive hits on configured site list.');
  } else {
    for (const h of hits.slice(0, 50)) {
      lines.push(`- ${h.url} (HTTP ${h.status ?? '?'})`);
    }
    if (hits.length > 50) lines.push(`- ...and ${hits.length - 50} more`);
  }

  lines.push(
    '',
    '## CIRCL Notes',
    '- Attach to **associate** or **confidant** dossier as alias/social evidence.',
    '- Handle match is not identity proof — corroborate with other OSINT.',
    '',
    '## Discipline Note',
    'Public OSINT only. Lawful use with PROVISO shared-work discipline.',
  );

  return lines.join('\n');
}

export async function scanAliases(
  aliases: string[],
  threads?: number,
): Promise<{ results: Awaited<ReturnType<typeof scanUsername>>[] }> {
  const results: Awaited<ReturnType<typeof scanUsername>>[] = [];
  for (const alias of aliases) {
    const trimmed = alias.trim();
    if (!trimmed) continue;
    results.push(await scanUsername(trimmed, threads));
  }
  return { results };
}