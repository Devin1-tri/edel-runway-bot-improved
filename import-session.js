#!/usr/bin/env node
/**
 * ⚡ Edel Bot — Import Session Cookie
 * 
 * Cara pakai:
 *   node import-session.js
 *   atau: npm run import
 */
process.argv[2] = 'import';
await import('./src/index.js');
