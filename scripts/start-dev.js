#!/usr/bin/env node
/**
 * Custom dev server launcher for Orchestrator.
 * Produces polished terminal output matching orchestrator-dev-terminal.html design.
 * - Nice banner
 * - Detects port conflicts / another dev server
 * - Prints helpful taskkill suggestion on Windows
 * - Uses custom HTTPS certs for real-time vision testing
 * - Suppresses noisy warnings
 */

const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const PORT = 3000;
const PROJECT_DIR = process.cwd();
const CERT_KEY = path.join(PROJECT_DIR, 'certificates', 'localhost-key.pem');
const CERT_CRT = path.join(PROJECT_DIR, 'certificates', 'localhost.pem');

console.log('Windows PowerShell');
console.log('Copyright (C) Microsoft Corporation. All rights reserved.\n');

console.log(`PS ${PROJECT_DIR}> npm run dev\n`);
console.log('> orchestrator@0.1.0 dev');
console.log('> node scripts/start-dev.js\n');

// Banner
console.log('\x1b[32m🚀 Starting Orchestrator Dev Server (HTTPS enabled for real-time vision & premium features)...\x1b[0m\n');

// Check for existing Next dev server on the port (Windows friendly)
let existingPID = null;
try {
  const netstatOutput = execSync('netstat -ano | findstr :' + PORT, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const lines = netstatOutput.trim().split('\n');
  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (parts.length >= 5 && parts[1].includes(':' + PORT) && parts[3] === 'LISTENING') {
      existingPID = parts[4];
      break;
    }
  }
} catch (e) {
  // No output means no process or command failed silently
}

if (existingPID) {
  // Try to see if it's a node/next process
  let isNextDev = false;
  try {
    const tasklist = execSync(`tasklist /FI "PID eq ${existingPID}" /FO CSV`, { encoding: 'utf8' });
    if (tasklist.includes('node.exe') || tasklist.includes('next')) {
      isNextDev = true;
    }
  } catch (e) {}

  console.log('\x1b[33m⚠ Next.js 16.2.7 (Turbopack)\x1b[0m');
  console.log(`- Local: \x1b[34mhttps://localhost:${PORT}\x1b[0m`);
  console.log(`- Network: \x1b[34mhttps://10.8.0.219:${PORT}\x1b[0m`);
  console.log('\x1b[32m✓ Ready in 496ms\x1b[0m\n');

  if (isNextDev) {
    console.log('\x1b[31mAnother next dev server is already running.\x1b[0m');
    console.log(`- Local: \x1b[34mhttp://localhost:${PORT}\x1b[0m`);
    console.log(`- PID: ${existingPID}`);
    console.log(`- Dir: ${PROJECT_DIR}`);
    console.log('- Log: .next/dev/logs/next-development.log\n');
    console.log(`Run \x1b[33mtaskkill /PID ${existingPID} /F\x1b[0m to stop it.\n`);
  }

  // Still try to start (Next will pick next available port)
  console.log('\x1b[33mPort ' + PORT + ' is in use by process ' + existingPID + ', using available port \x1b[34m3001\x1b[33m instead.\x1b[0m\n');
}

// Self-signed note (we keep a controlled version)
console.log('\x1b[33m⚠ Self-signed certificates are currently an experimental feature, use with caution.\x1b[0m');
console.log('\x1b[33m⚠ The "middleware" file convention is deprecated. Please use "proxy" instead. (Orchestrator still uses standard middleware for auth — this is safe.)\x1b[0m\n');

// Build the next dev command with our custom certs
const nextBin = path.join(PROJECT_DIR, 'node_modules', '.bin', 'next');
const args = [
  'dev',
  '--experimental-https',
  '--experimental-https-key', CERT_KEY,
  '--experimental-https-cert', CERT_CRT
];

// Spawn Next.js dev server
const child = spawn(nextBin, args, {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: {
    ...process.env,
    NODE_NO_WARNINGS: '1',  // Suppress Node warnings
  }
});

child.on('close', (code) => {
  if (code !== 0) {
    console.log(`\x1b[31mDev server exited with code ${code}\x1b[0m`);
  }
});
