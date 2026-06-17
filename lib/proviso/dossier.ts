// Copyright (c) 2026 Edward Marin. All rights reserved.
// PROVISO CIRCL — Corporate & Relational Intelligence Context Layer

import { tavily } from '@tavily/core';
import { resolveToolLLM } from '@/lib/ai/client';
import type { DossierSubjectType, ProvisoDossier, ProvisoDossierLink } from './types';

const tavilyClient = process.env.TAVILY_API_KEY
  ? tavily({ apiKey: process.env.TAVILY_API_KEY })
  : null;

export interface CreateDossierInput {
  subject_type: DossierSubjectType;
  full_name: string;
  aliases?: string[];
  primary_organization?: string;
  role_title?: string;
  location?: string;
  relationship_type?: string;
  relationship_to_name?: string;
  context_notes?: string;
  research_query?: string;
}

async function gatherPublicResearch(query: string): Promise<string> {
  if (!tavilyClient) {
    return '(Web research unavailable — configure TAVILY_API_KEY for live OSINT pass.)';
  }
  try {
    const results = await tavilyClient.search(query, {
      max_results: 6,
      search_depth: 'advanced',
    } as Parameters<typeof tavilyClient.search>[1]);
    const items = (results as { results?: { title: string; url: string; content?: string }[] }).results || [];
    if (!items.length) return '(No public search results returned.)';
    return items
      .map(
        (r, i) =>
          `[${i + 1}] ${r.title}\nURL: ${r.url}\n${(r.content || '').slice(0, 500)}`,
      )
      .join('\n\n');
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return `(Web research failed: ${msg})`;
  }
}

function subjectTypeLabel(type: DossierSubjectType): string {
  switch (type) {
    case 'corporate_officer':
      return 'Corporate Officer';
    case 'associate':
      return 'Associate';
    case 'organization':
      return 'Organization';
    default:
      return type;
  }
}

function dossierSectionGuide(type: DossierSubjectType): string {
  const base = `Output markdown with EXACTLY these sections:
## Subject Header
## Identity Resolution
## Public Profile
## Corporate / Network Context
## Legal & Reputational Signals (public record only)
## Associate Ring (related persons — if known from input)
## Risk & Relevance Scores
## Provenance & Gaps
## Discipline Note`;

  if (type === 'associate') {
    return `${base}
Focus on: relationship to the primary subject, role in the network, public affiliations, and why this associate matters to the officer/org context.
If relationship is confidant: emphasize trust proximity, advisory influence, communication channel role, and why this person is the inner circle (public signals only). Everyone has a confidant — map that layer explicitly when evidence supports it.
Do NOT invent private data.`;
  }
  if (type === 'organization') {
    return `${base}
Focus on: corporate structure, public positioning, key officers, and known associate ecosystem.`;
  }
  return `${base}
Focus on: executive role, corporate web, public filings/news, and known associates worth mapping.
Include an ## Associate Ring section that names likely confidant(s) if public record suggests one — everyone has a confidant; flag as UNMAPPED if none identified yet.`;
}

export async function synthesizeDossierMarkdown(
  input: CreateDossierInput,
  linkedSubjects: { name: string; type: DossierSubjectType; relationship: string }[] = [],
): Promise<{ markdown: string; provenance: string[] }> {
  const provenance: string[] = ['proviso_circl_synthesis'];
  const query =
    input.research_query ||
    [
      input.full_name,
      input.primary_organization,
      input.role_title,
      input.location,
      input.subject_type === 'associate' ? 'associate' : 'executive',
    ]
      .filter(Boolean)
      .join(' ');

  const research = await gatherPublicResearch(query);
  if (!research.startsWith('(')) provenance.push('tavily_public_search');

  const linkBlock =
    linkedSubjects.length > 0
      ? linkedSubjects
          .map((l) => `- ${l.name} (${l.type}): ${l.relationship}`)
          .join('\n')
      : '- (none linked yet)';

  const userBlock = [
    `Subject type: ${subjectTypeLabel(input.subject_type)}`,
    `Full name: ${input.full_name}`,
    input.aliases?.length ? `Aliases: ${input.aliases.join(', ')}` : null,
    input.primary_organization ? `Organization: ${input.primary_organization}` : null,
    input.role_title ? `Role: ${input.role_title}` : null,
    input.location ? `Location: ${input.location}` : null,
    input.relationship_type ? `Relationship type: ${input.relationship_type}` : null,
    input.relationship_to_name ? `Related to: ${input.relationship_to_name}` : null,
    input.context_notes ? `User context:\n${input.context_notes}` : null,
    `Known network links:\n${linkBlock}`,
    `\nPublic research pass:\n${research}`,
  ]
    .filter(Boolean)
    .join('\n');

  try {
    const { client, model } = resolveToolLLM();
    const system = `You are PROVISO CIRCL, the proprietary Corporate & Relational Intelligence Context Layer inside Orchestrator.
You build dossiers on corporate officers, associates, and organizations using ONLY public OSINT and user-provided context.
Never claim access to private vaults, breach data, or surveillance. Flag identity ambiguity when multiple public matches exist.
${dossierSectionGuide(input.subject_type)}
End with a one-line confidence: LOW | MEDIUM | HIGH.`;

    const res = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userBlock },
      ],
      max_tokens: 2000,
    });

    const content = res.choices[0]?.message?.content?.trim();
    if (content) {
      provenance.push(`llm:${model}`);
      return {
        markdown: `# PROVISO CIRCL Dossier — ${input.full_name}\n\n**Type:** ${subjectTypeLabel(input.subject_type)}\n\n${content}`,
        provenance,
      };
    }
  } catch {
    // fallback below
  }

  provenance.push('template_fallback');
  return {
    markdown: [
      `# PROVISO CIRCL Dossier — ${input.full_name}`,
      '',
      `**Type:** ${subjectTypeLabel(input.subject_type)}`,
      '',
      '## Subject Header',
      `- Name: ${input.full_name}`,
      input.primary_organization ? `- Organization: ${input.primary_organization}` : '',
      input.role_title ? `- Role: ${input.role_title}` : '',
      input.relationship_to_name
        ? `- Related to: ${input.relationship_to_name} (${input.relationship_type || 'associate'})`
        : '',
      '',
      '## Public Profile',
      research,
      '',
      '## Discipline Note',
      'Configure OPENAI_API_KEY + TAVILY_API_KEY for full autonomous synthesis.',
      '',
      '**Confidence:** LOW',
    ]
      .filter((l) => l !== '')
      .join('\n'),
    provenance,
  };
}

export function formatNetworkDossier(
  primary: ProvisoDossier,
  associates: ProvisoDossier[],
  links: ProvisoDossierLink[],
): string {
  const confidants = associates.filter((a) =>
    links.some(
      (l) =>
        l.relationship_type === 'confidant' &&
        ((l.from_dossier_id === primary.id && l.to_dossier_id === a.id) ||
          (l.to_dossier_id === primary.id && l.from_dossier_id === a.id)),
    ),
  );

  const lines = [
    `# PROVISO CIRCL Network Dossier`,
    '',
    `## Primary: ${primary.full_name} (${primary.subject_type})`,
    primary.primary_organization ? `Organization: ${primary.primary_organization}` : '',
    '',
    '## Confidant Layer',
    confidants.length
      ? confidants.map((c) => `- **${c.full_name}**${c.role_title ? ` (${c.role_title})` : ''}`).join('\n')
      : '- UNMAPPED — everyone has a confidant. Add an associate with relationship `confidant`.',
    '',
    '## Associate Ring',
  ];

  if (!associates.length) {
    lines.push('- No linked associates in CIRCL yet.');
  } else {
    for (const a of associates) {
      const link = links.find(
        (l) =>
          (l.from_dossier_id === primary.id && l.to_dossier_id === a.id) ||
          (l.to_dossier_id === primary.id && l.from_dossier_id === a.id),
      );
      lines.push(
        `### ${a.full_name} (${a.subject_type})`,
        link ? `Relationship: ${link.relationship_type}${link.notes ? ` — ${link.notes}` : ''}` : '',
        a.role_title ? `Role: ${a.role_title}` : '',
        '',
        a.dossier_markdown.slice(0, 1200),
        a.dossier_markdown.length > 1200 ? '\n...(truncated)\n' : '',
      );
    }
  }

  return lines.filter(Boolean).join('\n');
}