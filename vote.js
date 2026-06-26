#!/usr/bin/env node
/**
 * ⚡ Edel Bot — Vote Sekali
 * 
 * Cara pakai:
 *   node vote.js
 *   atau: npm run vote
 */
process.argv[2] = 'vote';
await import('./src/index.js');
