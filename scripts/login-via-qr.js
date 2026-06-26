#!/usr/bin/env node
/**
 * 📱 Edel Bot — Interactive Login via Screenshots + Telegram
 *
 * No VNC needed. I take screenshots, you guide me.
 * You tell me what to click, I click it.
 */

import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PROFILE_DIR = path.join(ROOT, 'profiles', 'edel-profile2');
const SCREENSHOT_DIR = path.join(ROOT, 'screenshots');
const SESSION_FILE = path.join(ROOT, 'sessions', 'state.json');

let page, context;

async function shot(name) {
  const p = path.join(SCREENSHOT_DIR, name);
  await page.screenshot({ path: p, fullPage: false });
  return p;
}

async function waitForLogin(timeoutMs = 300000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await new Promise(r => setTimeout(r, 3000));
    const cookies = await context.cookies();
    const c = cookies.find(x => x.name === 'edel_session');
    if (c) {
      const url = page.url();
      if (!url.includes('/login') && !url.includes('/register')) {
        return { success: true, cookie: c.value };
      }
    }
  }
  const cookies = await context.cookies();
  const c = cookies.find(x => x.name === 'edel_session');
  return { success: !!c, cookie: c?.value };
}

async function main() {
  const email = process.argv[2];
  if (!email) { console.log('❌ node scripts/login-via-qr.js <email>'); process.exit(1); }

  fs.mkdirSync(PROFILE_DIR, { recursive: true });
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  fs.mkdirSync(path.dirname(SESSION_FILE), { recursive: true });

  // Kill old profile lock
  try { fs.rmSync(PROFILE_DIR + '/SingletonLock', { force: true }); } catch {}

  console.log('🚀 Launching Chromium...');
  context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    args: [
      '--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage',
      '--disable-gpu','--start-maximized',
      '--disable-blink-features=AutomationControlled',
      '--password-store=basic',
    ],
    ignoreDefaultArgs: ['--enable-automation'],
    viewport: { width: 1280, height: 900 },
  });

  page = await context.pages()[0] || await context.newPage();
  await page.addInitScript(() => { navigator.webdriver = false; });

  // Navigate
  await page.goto('https://runway.edel.finance/login', {
    waitUntil: 'networkidle', timeout: 30000,
  });
  await page.waitForTimeout(2000);

  // Fill email
  await page.fill('input[type="email"]', email);
  await page.waitForTimeout(500);

  // Click "Sign In With Passkey"
  await page.locator('button').filter({ hasText: /passkey/i }).first().click();
  await page.waitForTimeout(4000);

  // Click "Entering Desk" button (force if disabled)
  const enteringBtn = page.locator('button').filter({ hasText: /Entering/i });
  if (await enteringBtn.count() > 0) {
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button'))
        .find(b => b.textContent.includes('Entering'));
      if (btn) { btn.disabled = false; btn.removeAttribute('aria-disabled'); }
    });
    await page.waitForTimeout(300);
    await enteringBtn.click({ force: true });
    await page.waitForTimeout(3000);
  }

  console.log('✅ Chrome ready at /login');

  // Wait for login (max 5 minutes)
  const result = await waitForLogin(300000);

  if (result.success && result.cookie) {
    console.log('✅ COOKIE FOUND!');
    const state = {
      cookies: [{ name: 'edel_session', value: result.cookie, domain: 'runway.edel.finance', path: '/', expires: Date.now()/1000+86400*30, httpOnly: false, secure: true, sameSite: 'Lax' }],
      origins: [{ origin: 'https://runway.edel.finance', localStorage: [] }],
    };
    fs.writeFileSync(SESSION_FILE, JSON.stringify(state, null, 2));
    console.log('✅ Bot session state.json updated!');
  } else {
    console.log('❌ No cookie after timeout');
    const p = await shot('timeout.png');
    console.log(`Screenshot: ${p}`);
  }

  await page.waitForTimeout(2000);
  await context.close();
}

main().catch(err => {
  console.error('❌', err.message);
  process.exit(1);
});
