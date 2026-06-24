#!/usr/bin/env node
/**
 * 📱 Edel Bot — Login via VNC + QR Passkey
 *
 * 🔥 CARA PAKAI:
 *
 * Step 1 — Di TERMINAL 1 (VPS):
 *   node scripts/login-via-qr.js
 *   → Masukin email
 *   → Browser nyala di Xvfb
 *   → Klik "Sign In With Passkey" → "Entering Desk"
 *   → Muncul QR code passkey
 *
 * Step 2 — Di VNC CLIENT (HP/PC lo):
 *   Buka VNC client → connect ke IP_VPS:5900
 *   Password: edelbot
 *   → Liat QR code di Chrome → SCAN PAKE HP
 *
 * Step 3 — Selesai! Cookie auto tersimpan.
 *
 * REQUIREMENTS:
 *   apt install x11vnc   (udah diinstall)
 *   Xvfb running on :99  (udah jalan)
 */

import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import readline from 'readline';
import { fileURLToPath } from 'url';
import { execSync, spawn } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PROFILE_DIR = path.join(ROOT, 'profiles', 'edel-profile');
const SCREENSHOT_DIR = path.join(ROOT, 'screenshots');
const VNC_PASS = 'edelbot';
const VNC_PORT = 5900;

function ask(query) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(query, ans => { rl.close(); resolve(ans.trim()); }));
}

function ensureDisplay() {
  // Check Xvfb
  try {
    execSync('xdpyinfo -display :99 2>/dev/null', { timeout: 3 });
    return true;
  } catch {
    try {
      spawn('Xvfb', [':99', '-screen', '0', '1920x1080x24', '-ac'], {
        detached: true, stdio: 'ignore',
      }).unref();
      return true;
    } catch { return false; }
  }
}

function startVNC() {
  try {
    // Kill existing x11vnc
    execSync('pkill -f "x11vnc.*:99" 2>/dev/null', { timeout: 2 });
    
    // Start new
    const proc = spawn('x11vnc', [
      '-display', ':99',
      '-forever',
      '-shared',
      '-rfbport', String(VNC_PORT),
      '-passwd', VNC_PASS,
      '-bg',
    ], { stdio: 'ignore', detached: true });
    proc.unref();
    return true;
  } catch { return false; }
}

function getIP() {
  try {
    const ip = execSync('curl -s ifconfig.me', { timeout: 5 }).toString().trim();
    return ip;
  } catch {
    // Try local IP
    try {
      const ip = execSync('ip route get 1 | awk \'{print $7;exit}\'', { timeout: 3 }).toString().trim();
      return ip || 'VPS_IP';
    } catch { return 'VPS_IP'; }
  }
}

async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║   📱 Edel Bot — Login via VNC + QR Passkey           ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log('');

  // Setup
  ensureDisplay();
  startVNC();
  const vpsIP = getIP();
  fs.mkdirSync(PROFILE_DIR, { recursive: true });
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

  console.log(`✅ Xvfb running on :99`);
  console.log(`✅ VNC ready at ${vpsIP}:${VNC_PORT} — password: ${VNC_PASS}`);
  console.log('');

  // Launch Playwright
  console.log('🚀 Launching Chromium...');
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    args: [
      '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
      '--disable-gpu', '--start-maximized',
      '--password-store=basic',
      '--disable-blink-features=AutomationControlled',
      '--enable-features=WebAuthenticationHybridClient,WebAuthenticationAllowHybridClient',
    ],
    viewport: { width: 1280, height: 900 },
    ignoreDefaultArgs: ['--enable-automation'],
  });

  const page = await context.pages()[0] || await context.newPage();
  await page.addInitScript(() => { navigator.webdriver = false; });

  // Open login page
  console.log('🌐 Opening https://runway.edel.finance/login ...');
  await page.goto('https://runway.edel.finance/login', {
    waitUntil: 'networkidle', timeout: 30000,
  });
  await page.waitForTimeout(2000);

  const email = await ask('📧 Masukin email lo: ');
  if (!email) { console.log('❌'); await context.close(); process.exit(1); }

  await page.fill('input[type="email"]', email);
  await page.waitForTimeout(300);
  await page.locator('button').filter({ hasText: /passkey/i }).first().click();
  await page.waitForTimeout(3000);

  // Check for "Entering Desk" button
  const enteringBtn = page.locator('button').filter({ hasText: /Entering/i });
  if (await enteringBtn.count() > 0) {
    console.log('✅ Challenge diterima. Klik Entering Desk...');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'step1-ready.png') });
    
    await enteringBtn.click();
    await page.waitForTimeout(3000);

    console.log('');
    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║   📱 LANGKAH TERAKHIR — SCAN QR CODE!                ║');
    console.log('╚══════════════════════════════════════════════════════════╝');
    console.log('');
    console.log('   1️⃣  Buka VNC client di HP/PC lo');
    console.log(`   2️⃣  Connect ke → ${vpsIP}:${VNC_PORT}`);
    console.log(`   3️⃣  Password → ${VNC_PASS}`);
    console.log('   4️⃣  Lo bakal liat Chrome dengan QR code passkey');
    console.log('   5️⃣  SCAN QR CODE PAKE HP LO');
    console.log('');
    console.log('   🔑 VNC client recommendations:');
    console.log('      - HP: RealVNC, bVNC, VNC Viewer (Android/iOS)');
    console.log('      - PC: TightVNC, RealVNC, TigerVNC');
    console.log('');
    console.log('⏳ Nunggu login (max 3 menit)...');

    // Take screenshots periodically
    for (let i = 0; i < 6; i++) {
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, `login-progress-${i+1}.png`) });
      await new Promise(r => setTimeout(r, 5000));
    }
  } else {
    console.log('⚠️  Entering Desk gak muncul. Screenshot:');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'step1-error.png') });
  }

  // Check login status
  let loggedIn = false;
  try {
    await page.waitForURL('**/listing-calls*', { timeout: 120000 });
    loggedIn = true;
  } catch {
    loggedIn = !page.url().includes('/login');
  }

  if (loggedIn) {
    console.log('✅ LOGIN SUKSES!');
  } else {
    console.log('⏳ Belum login, cek cookies...');
  }

  // Extract cookies
  const cookies = await context.cookies();
  const edelCookie = cookies.find(c => c.name === 'edel_session');

  if (edelCookie) {
    console.log('');
    console.log('✅ edel_session COOKIE FOUND!');
    const state = {
      cookies: [{
        name: 'edel_session', value: edelCookie.value,
        domain: 'runway.edel.finance', path: '/',
        expires: Date.now() / 1000 + 86400 * 30,
        httpOnly: false, secure: true, sameSite: 'Lax',
      }],
      origins: [{ origin: 'https://runway.edel.finance', localStorage: [] }],
    };
    const sessionDir = path.join(ROOT, 'sessions');
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.writeFileSync(path.join(sessionDir, 'state.json'), JSON.stringify(state, null, 2));
    console.log('✅ Bot session state.json updated!');
  } else {
    console.log('❌ Belum ada edel_session.');
    console.log('   Screenshot di:', SCREENSHOT_DIR);
    console.log('   VNC ke VPS buat liat langsung browser.');
  }

  await page.waitForTimeout(3000);
  await context.close();
  console.log('✅ Selesai!');
}

main().catch(err => {
  console.error('❌ Fatal:', err.message);
  process.exit(1);
});
