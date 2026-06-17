// Copyright (c) 2026 Edward Marin. All rights reserved.

import { resolveToolLLM } from '@/lib/ai/client';
import type { ProvisoSharedEntry } from './types';
import type { EodBriefSections } from './types';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function fallbackBrief(workDate: string, entries: ProvisoSharedEntry[]): string {
  const completed = entries.map((e) => e.title);
  const tags = [...new Set(entries.flatMap((e) => e.workflow_tags || []))];
  return [
    `# PROVISO End-of-Day Brief — ${workDate}`,
    '',
    '## Headline',
    entries.length
      ? `You placed ${entries.length} item(s) in Shared Work today.`
      : 'No shared work was recorded today — discipline gap detected.',
    '',
    '## Completed / Placed Today',
    ...completed.map((c) => `- ${c}`),
    '',
    '## Still Open',
    '- Review anything not moved to Shared Work before close.',
    '',
    '## Workflow Tags Active',
    ...(tags.length ? tags.map((t) => `- ${t}`) : ['- (none yet)']),
    '',
    '## Tomorrow Focus',
    '- Drop today\'s outcomes in Shared Work within 5 minutes of EOD.',
    '- Attach one Briefcase file before your next live meeting.',
    '',
    '## Discipline Note',
    'Private Vault entries are invisible to the agent by design.',
  ].join('\n');
}

export async function generateEodBriefMarkdown(
  workDate: string,
  entries: ProvisoSharedEntry[],
): Promise<string> {
  if (entries.length === 0) {
    return fallbackBrief(workDate, entries);
  }

  const entryDigest = entries
    .map(
      (e, i) =>
        `${i + 1}. ${e.title}${e.notes ? ` — ${e.notes.slice(0, 300)}` : ''}${e.workflow_tags?.length ? ` [${e.workflow_tags.join(', ')}]` : ''}`,
    )
    .join('\n');

  try {
    const { client, model } = resolveToolLLM();
    const system = `You are PROVISO, the proprietary disciplined workspace engine inside Orchestrator.
Generate an End-of-Day brief from ONLY the shared work entries provided.
Never reference or infer private vault content.
Output markdown with EXACTLY these sections:
## Headline
## Completed Today
## Still Open
## Connections (links between items)
## Tomorrow Focus (3 bullets max)
## Discipline Note
Be concise, actionable, professional.`;

    const res = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: system },
        {
          role: 'user',
          content: `Work date: ${workDate}\n\nShared work entries:\n${entryDigest}`,
        },
      ],
      max_tokens: 900,
    });

    const content = res.choices[0]?.message?.content?.trim();
    if (content) {
      return `# PROVISO End-of-Day Brief — ${workDate}\n\n${content.replace(/^#.*\n/, '')}`;
    }
  } catch {
    // fall through to template
  }

  return fallbackBrief(workDate, entries);
}

export function parseEodSections(markdown: string): EodBriefSections {
  const sections: EodBriefSections = {
    headline: '',
    completed_today: [],
    still_open: [],
    connections: [],
    tomorrow_focus: [],
    discipline_note: '',
  };

  const blocks = markdown.split(/^## /m).slice(1);
  for (const block of blocks) {
    const [heading, ...rest] = block.split('\n');
    const body = rest.join('\n').trim();
    const bullets = body
      .split('\n')
      .filter((l) => l.startsWith('- '))
      .map((l) => l.slice(2).trim());

    const key = heading?.toLowerCase().replace(/\s+/g, '_');
    if (key === 'headline') sections.headline = body.split('\n')[0]?.trim() || '';
    else if (key === 'completed_today' || key === 'completed_/_placed_today') sections.completed_today = bullets;
    else if (key === 'still_open') sections.still_open = bullets.length ? bullets : [body];
    else if (key === 'connections' || key === 'connections_(links_between_items)') sections.connections = bullets;
    else if (key === 'tomorrow_focus') sections.tomorrow_focus = bullets;
    else if (key === 'discipline_note') sections.discipline_note = body;
  }

  return sections;
}

export { todayIso };