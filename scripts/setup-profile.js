#!/usr/bin/env node
/**
 * ⚡ Edel Bot — 1x Profile Setup
 *
 * Launches a persistent Chromium profile + CDP Virtual Authenticator
 * so you can login to runway.edel.finance ONE TIME manually.
 *
 * After this setup, the auto-refresh script handles everything silently.
 *
 * USAGE:
 *   node scripts/setup-profile.js
 *
 * When the browser opens, login with email → passkey.
 * The passkey credential will be stored in the virtual authenticator
 * AND the profile for future auto-refresh.
 *
 * ===== INTERACTIVE LOGIN METHODS =====
 *
 * METHOD A — X11 forwarding (recommended if you SSH from a desktop):
 *   ssh -X azureuser@your-vps
 *   node scripts/setup-profile.js
 *   # A Chrome window opens on YOUR screen. Login there.
 *
 * METHOD B — VNC (SSH from anywhere):
 *   ssh azureuser@your-vps
 *   x11vnc -display :99 -forever -passwd edelbot &
 *   node scripts/setup-profile.js
 *   # Connect via VNC client to server-ip:5900, password: edelbot
 *
 * METHOD C — Local machine (run on YOUR PC, send profile):
 *   # Copy the scripts folder to your PC, run:
 *   node scripts/setup-profile.js
 *   # Login in the Chrome window, then send profiles/ back to VPS
 */

import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PROFILE_DIR = path.join(ROOT, 'profiles', 'edel-profile');

async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║   🎬 Edel Bot — Persistent Profile Setup              ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log('');

  // Clean previous profile if exists
  if (fs.existsSync(PROFILE_DIR)) {
    console.log('⚠️  Existing profile found at:');
    console.log(`   ${PROFILE_DIR}`);
    console.log('');
    console.log('   Delete it first if you want a fresh start:');
    console.log('   rm -rf ' + PROFILE_DIR);
    console.log('');
    console.log('   Re-run this script after deletion.');
    process.exit(1);
  }

  console.log('🔧 Creating persistent Chromium profile...');
  fs.mkdirSync(PROFILE_DIR, { recursive: true });

  // Launch persistent context (headed mode — needs display)
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--enable-features=WebAuthenticationEnableCredentialSync,WebAuthenticationForceAutomaticPasskeyUsability,WebAuthenticationWinUI,WebAuthenticationAllowWindowsUIForPasskeys',
      '--password-store=basic',
      '--disable-features=ChromeWhatsNewUI',
    ],
    viewport: { width: 1280, height: 900 },
    ignoreDefaultArgs: ['--enable-automation'], // Hide "Chrome is being controlled"
  });

  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);

  // Enable WebAuthn and create a virtual authenticator
  // This emulates a software-based platform authenticator
  // Credentials created during login will be stored here
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      hasLargeBlob: false,
      automaticPresenceSimulation: true,
      isUserVerified: true,
    },
  });
  console.log('✅ Virtual Authenticator enabled');
  console.log('   (Simulates a hardware passkey — stored in profile)');
  console.log('');

  // Navigate to login
  console.log('🌐 Opening https://runway.edel.finance/login ...');
  console.log('');
  console.log('========================================');
  console.log('   👆 NOW LOGIN IN THE BROWSER WINDOW');
  console.log('========================================');
  console.log('');
  console.log('   Steps:');
  console.log('   1. Enter your email');
  console.log('   2. Click "Sign In With Passkey"');
  console.log('   3. Approve the passkey prompt');
  console.log('');
  console.log('   The virtual authenticator will store');
  console.log('   the passkey credential automatically.');
  console.log('');

  await page.goto('https://runway.edel.finance/login', {
    waitUntil: 'networkidle',
    timeout: 30000,
  });

  // Wait for login — user navigates to /listing-calls when done
  console.log('⏳ Waiting for login... (open /listing-calls when done)');
  
  try {
    await page.waitForURL('**/listing-calls*', { timeout: 300000 }); // 5 min timeout
    console.log('✅ Login detected!');
  } catch {
    console.log('⚠️  Timeout waiting for login. Checking current URL...');
  }

  const currentUrl = page.url();
  console.log(`📍 Current URL: ${currentUrl}`);

  // Extract cookies
  const cookies = await context.cookies();
  const edelCookie = cookies.find(c => c.name === 'edel_session');
  
  if (edelCookie) {
    console.log('✅ edel_session cookie found!');
    console.log(`   Expires: ${new Date(edelCookie.expires * 1000).toLocaleString()}`);
    
    // Save to bot's session
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
    console.log('✅ Bot session state.json updated!');
  } else {
    console.log('⚠️  No edel_session cookie found. Try logging in again.');
  }

  // Wait a moment then close
  console.log('');
  console.log('⏳ Closing browser in 5 seconds...');
  await new Promise(r => setTimeout(r, 5000));
  await context.close();

  console.log('');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║   ✅ SETUP COMPLETE!                                   ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log('');
  console.log('Profile saved at: ' + PROFILE_DIR);
  console.log('');
  console.log('Now the auto-refresh cron will handle everything.');
  console.log('');
  console.log('To test auto-refresh manually:');
  console.log('   node scripts/auto-refresh.js');
  console.log('');
}

main().catch(err => {
  console.error('❌ Setup failed:', err.message);
  process.exit(1);
});
