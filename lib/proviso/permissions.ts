// Copyright (c) 2026 Edward Marin. All rights reserved.

import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { DEFAULT_GRANT_TTL_MINUTES } from './constants';
import type { PermissionGrantInput } from './schemas';

export interface SignedGrantPayload {
  grant_id: string;
  user_id: string;
  scope: PermissionGrantInput['scope'];
  target: string;
  actions: string[];
  expires_at: string;
  nonce: string;
}

function grantSecret(): string {
  return (
    process.env.PROVISO_GRANT_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    'proviso-dev-grant-secret-change-in-production'
  );
}

function signPayload(payload: string): string {
  return createHmac('sha256', grantSecret()).update(payload).digest('hex');
}

export function createSignedGrantToken(
  userId: string,
  input: PermissionGrantInput,
  grantId: string,
): { token: string; expires_at: string; payload: SignedGrantPayload } {
  const ttl = input.ttl_minutes ?? DEFAULT_GRANT_TTL_MINUTES;
  const expiresAt = new Date(Date.now() + ttl * 60_000).toISOString();
  const payload: SignedGrantPayload = {
    grant_id: grantId,
    user_id: userId,
    scope: input.scope,
    target: input.target,
    actions: input.actions,
    expires_at: expiresAt,
    nonce: randomBytes(12).toString('hex'),
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = signPayload(body);
  return { token: `${body}.${signature}`, expires_at: expiresAt, payload };
}

export function verifySignedGrantToken(
  token: string,
  userId: string,
): { valid: boolean; payload?: SignedGrantPayload; error?: string } {
  const parts = token.split('.');
  if (parts.length !== 2) return { valid: false, error: 'Malformed token' };

  const [body, signature] = parts as [string, string];
  const expected = signPayload(body);
  const sigBuf = Buffer.from(signature, 'utf8');
  const expBuf = Buffer.from(expected, 'utf8');
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    return { valid: false, error: 'Invalid signature' };
  }

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SignedGrantPayload;
    if (payload.user_id !== userId) return { valid: false, error: 'User mismatch' };
    if (new Date(payload.expires_at).getTime() < Date.now()) {
      return { valid: false, error: 'Token expired' };
    }
    return { valid: true, payload };
  } catch {
    return { valid: false, error: 'Invalid payload' };
  }
}