#!/usr/bin/env node
/**
 * ⚡ Edel Bot — Hapus Session (Force re-import)
 * 
 * Cara pakai:
 *   node clear-session.js
 *   atau: npm run clear
 */
process.argv[2] = 'clear';
await import('./src/index.js');
