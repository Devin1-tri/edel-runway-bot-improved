#!/usr/bin/env node
/**
 * ⚡ Edel Bot — Mulai Bot Scheduler + Telegram Interactive
 * 
 * Cara pakai:
 *   node start.js
 *   atau: npm run start
 */
process.argv[2] = 'start';
await import('./src/index.js');
