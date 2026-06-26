#!/usr/bin/env node
/**
 * ⚡ Edel Bot — Cek Status Session & Konfigurasi
 * 
 * Cara pakai:
 *   node status.js
 *   atau: npm run status
 */
process.argv[2] = 'status';
await import('./src/index.js');
