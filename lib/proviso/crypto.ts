// Copyright (c) 2026 Edward Marin. All rights reserved.
// Client-side vault encryption helpers (Web Crypto API).

const PBKDF2_ITERATIONS = 210_000;

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const saltBuffer = new Uint8Array(salt);
  const baseKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: saltBuffer, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptVaultPayload(
  plaintext: string,
  password: string,
): Promise<{ ciphertext: string; iv: string; salt: string }> {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const ivBytes = new Uint8Array(iv);
  const cipherBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: ivBytes },
    key,
    enc.encode(plaintext),
  );
  return {
    ciphertext: toBase64(cipherBuffer),
    iv: toBase64(iv.buffer),
    salt: toBase64(salt.buffer),
  };
}

export async function decryptVaultPayload(
  ciphertext: string,
  iv: string,
  salt: string,
  password: string,
): Promise<string> {
  const key = await deriveKey(password, fromBase64(salt));
  const ivBytes = new Uint8Array(fromBase64(iv));
  const cipherBytes = new Uint8Array(fromBase64(ciphertext));
  const plainBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: ivBytes },
    key,
    cipherBytes,
  );
  return new TextDecoder().decode(plainBuffer);
}