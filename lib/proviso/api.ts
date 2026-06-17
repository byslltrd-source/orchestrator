import { NextResponse } from 'next/server';
import { OWNER_USER_ID } from '@/lib/constants';

export function provisoOwnerId(): string {
  return OWNER_USER_ID;
}

export function agentAccessDenied(zone: string): NextResponse {
  return NextResponse.json(
    {
      error: 'AGENT_ACCESS_DENIED',
      message: `PROVISO blocks agent access to zone: ${zone}. Private Vault requires user password only.`,
    },
    { status: 403 },
  );
}

export function isAgentRequest(request: Request): boolean {
  return request.headers.get('x-proviso-caller') === 'agent';
}