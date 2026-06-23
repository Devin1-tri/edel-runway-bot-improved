#!/usr/bin/env node
/**
 * ⚡ Edel Bot — QR Passkey Login via VPS
 *
 * Buka Playwright browser di VPS (Xvfb display), masuk ke login page.
 * Lo tinggal masukin email → QR passkey muncul.
 * Lo scan dari HP → cookie & profile auto tersimpan.
 *
 * USAGE:
 *   node scripts/login-via-qr.js
 *
 * Requires Xvfb to be running (Xvfb :99 -screen 0 1920x1080x24 &)
 * Or set HEADLESS=true to use screenshot-only mode
 */

import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import readline from 'readline';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PROFILE_DIR = path.join(ROOT, 'profiles', 'edel-profile');

// Check if DISPLAY is available
function checkDisplay() {
  try {
    const out = execSync('xdpyinfo -display :99 2>/dev/null | head -1', { timeout: 3 });
    return out.toString().includes('name');
  } catch {
    return false;
  }
}

function ask(query) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(query, ans => { rl.close(); resolve(ans); }));
}

async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║   📱 Edel Bot — QR Passkey Login via VPS              ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log('');

  // Check display
  const hasDisplay = checkDisplay();
  console.log(`🖥️  Display :99: ${hasDisplay ? 'AVAILABLE ✅' : 'NOT FOUND ❌'}`);

  if (!hasDisplay) {
    console.log('   Starting Xvfb...');
    try {
      execSync('Xvfb :99 -screen 0 1920x1080x24 &', { timeout: 3 });
      await new Promise(r => setTimeout(r, 2000));
      console.log('   ✅ Xvfb started on :99');
    } catch (err) {
      console.log(`   ⚠️  Could not start Xvfb: ${err.message}`);
      console.log('   Falling back to screenshot-only mode (VNC optional)');
    }
  }

  // Setup profile directory
  fs.mkdirSync(PROFILE_DIR, { recursive: true });

  const headless = !checkDisplay(); // Headed if display available

  console.log(`🚀 Launching Chromium (${headless ? 'headless' : 'headed on :99'})...`);
  console.log('');

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--start-maximized',
      '--password-store=basic',
      '--disable-features=ChromeWhatsNewUI',
    ],
    viewport: { width: 1280, height: 900 },
    ignoreDefaultArgs: ['--enable-automation'],
  });

  const page = await context.newPage();

  // Navigate to login
  console.log('🌐 Opening https://runway.edel.finance/login ...');
  console.log('');
  console.log('============================================');
  console.log('     👆 STEP 1: ENTER YOUR EMAIL');
  console.log('============================================');
  console.log('');

  await page.goto('https://runway.edel.finance/login', {
    waitUntil: 'networkidle',
    timeout: 30000,
  });

  // Let the user type email
  const email = await ask('📧 Masukin email lo: ');
  if (!email) {
    console.log('❌ Email kosong. Exiting.');
    await context.close();
    process.exit(1);
  }

  // Fill email and submit
  await page.fill('input[type="email"], input#email, input[name="email"]', email);
  await new Promise(r => setTimeout(r, 500));

  // Click "Sign In With Passkey" button
  const passkeyBtn = await page.$('button:has-text("Passkey"), button:has-text("Sign In")');
  if (passkeyBtn) {
    await passkeyBtn.click();
  } else {
    // Try pressing Enter
    await page.keyboard.press('Enter');
  }

  console.log('');
  console.log('⏳ Waiting for passkey QR code...');
  await new Promise(r => setTimeout(r, 3000));

  // Check what happened - QR code should appear
  const currentUrl = page.url();
  console.log(`📍 URL: ${currentUrl}`);

  // Try to detect if we're in a passkey flow
  // The passkey might show a QR code or native prompt
  const screenshotDir = path.join(ROOT, 'screenshots');
  fs.mkdirSync(screenshotDir, { recursive: true });

  // Take screenshot
  const screenshotPath = path.join(screenshotDir, 'login-qr.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`📸 Screenshot saved: ${screenshotPath}`);

  console.log('');
  console.log('============================================');
  console.log('     📱 STEP 2: CHECK THE SCREENSHOT');
  console.log('============================================');
  console.log('');
  console.log(`   Screenshot at: ${screenshotPath}`);

  if (hasDisplay) {
    console.log('');
    console.log('   🖥️  Display :99 is active! Browser should be visible.');
    console.log('   If you\'re on the VPS desktop or VNC, you can see the browser.');
    console.log('');
    console.log('   To VNC into the VPS:');
    console.log(`     1. Install VNC client (TightVNC, RealVNC, etc.)`);
    console.log('     2. Connect to: YOUR_VPS_IP:5900');
    console.log('     3. Password: edelbot');
    console.log('');
    console.log('   OR use x11vnc already ready:');
    console.log('     ssh -L 5900:localhost:5900 azureuser@vps-ip');
    console.log('     x11vnc -display :99 -forever -passwd edelbot &');
  }

  // Wait for user interaction: wait for URL to change to listing-calls
  // or for the login to complete (max 5 minutes)
  console.log('');
  console.log('⏳ Waiting for login completion (scan QR from phone)...');
  console.log('   (Max wait: 5 minutes)');

  let loggedIn = false;
  try {
    await page.waitForURL('**/listing-calls*', { timeout: 300000 });
    loggedIn = true;
  } catch {
    // Check current URL
    const finalUrl = page.url();
    if (!finalUrl.includes('/login') && !finalUrl.includes('/register')) {
      loggedIn = true;
    }
  }

  if (loggedIn) {
    console.log('✅ LOGIN DETECTED!');
  } else {
    console.log('⚠️  Login not detected automatically. Checking cookies...');
  }

  // Extract cookies
  const cookies = await context.cookies();
  const edelCookie = cookies.find(c => c.name === 'edel_session');

  if (edelCookie) {
    console.log('');
    console.log('✅ edel_session COOKIE FOUND!');
    console.log(`   Token: ${edelCookie.value.substring(0, 40)}...`);
    console.log(`   Expires: ${new Date(edelCookie.expires * 1000).toLocaleString()}`);

    // Save to bot session
    const state = {
      cookies: [{
        name: 'edel_session',
        value: edelCookie.value,
        domain: 'runway.edel.finance',
        path: '/',
        expires: Date.now() / 1000 + 86400 * 30,
        httpOnly: false,
        secure: true,
        sameSite: 'Lax',
      }],
      origins: [{ origin: 'https://runway.edel.finance', localStorage: [] }],
    };

    const sessionDir = path.join(ROOT, 'sessions');
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.writeFileSync(path.join(sessionDir, 'state.json'), JSON.stringify(state, null, 2));
    console.log('');
    console.log('✅ Bot session state.json updated!');
    console.log('   Bot is ready to run.');
    console.log('');
    console.log('▶️  Start the bot:');
    console.log('   pm2 start ecosystem.config.cjs');
    console.log('   or: npm run start');
  } else {
    console.log('');
    console.log('❌ No edel_session cookie found.');
    console.log('   The passkey QR may not have been scanned.');
    console.log('   Try again and make sure to scan the QR from your phone.');
  }

  console.log('');
  console.log('⏳ Closing browser in 5 seconds...');
  await new Promise(r => setTimeout(r, 5000));
  await context.close();

  console.log('✅ Done!');
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
