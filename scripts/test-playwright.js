#!/usr/bin/env node
/**
 * Quick test: Can Playwright launch headless on this server?
 */
import { chromium } from 'playwright';

const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
});

const page = await browser.newPage();
await page.goto('https://runway.edel.finance', { waitUntil: 'networkidle', timeout: 15000 });
const title = await page.title();
const cookies = await page.context().cookies();

console.log(`Title: ${title}`);
console.log(`Cookies: ${cookies.length}`);
console.log(`URL: ${page.url()}`);

await browser.close();
console.log('✅ Playwright headless works on this server.');
