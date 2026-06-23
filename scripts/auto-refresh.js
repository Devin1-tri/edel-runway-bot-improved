#!/usr/bin/env node
/**
 * ⚡ Edel Bot — Auto Session Refresh
 *
 * Launches Playwright with a persistent profile + virtual authenticator,
 * navigates to runway.edel.finance, leverages the stored passkey to
 * auto-authenticate, and extracts the fresh edel_session cookie.
 *
 * This script is designed to be run via cron/SCHEDULER every ~10 hours
 * (or whenever the session is close to expiry).
 *
 * Requirements:
 *   - A persistent profile must exist at profiles/edel-profile/
 *     (created by running scripts/setup-profile.js once)
 *   - The virtual authenticator credential must have been stored during setup
 *
 * Exit codes:
 *   0  → Session refreshed successfully
 *   1  → No profile found (setup not run)
 *   2  → Could not login / no cookie obtained
 *   3  → Other errors
 */

import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PROFILE_DIR = path.join(ROOT, 'profiles', 'edel-profile');
const SESSION_FILE = path.join(ROOT, 'sessions', 'state.json');
const LOG_FILE = path.join(ROOT, 'logs', 'auto-refresh.log');

// Simple logger
function log(msg) {
  const ts = new Date().toISOString().replace('T', ' ').substring(0, 19);
  const line = `[${ts}] ${msg}`;
  console.log(line);
  try {
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    fs.appendFileSync(LOG_FILE, line + '\n');
  } catch {}
}

function now() {
  return Date.now();
}

async function main() {
  log('=== 🔄 AUTO SESSION REFRESH START ===');

  // 1. Check profile exists
  if (!fs.existsSync(PROFILE_DIR)) {
    log('❌ No persistent profile found at: ' + PROFILE_DIR);
    log('   Run: node scripts/setup-profile.js');
    process.exit(1);
  }
  log('✅ Profile found');

  // 2. Launch browser with persistent profile
  log('🚀 Launching Chromium...');
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: true, // Can run headless for auto-refresh!
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--enable-features=WebAuthenticationEnableCredentialSync,WebAuthenticationForceAutomaticPasskeyUsability',
      '--password-store=basic',
      '--disable-component-update',
    ],
    viewport: { width: 1280, height: 900 },
  });

  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);

  // 3. Enable WebAuthn + Virtual Authenticator with stored credential
  await cdp.send('WebAuthn.enable');
  
  // Get credentials already stored in the profile
  const credsResponse = await cdp.send('WebAuthn.getCredentials');
  log(`🔑 Stored credentials found: ${credsResponse.credentials?.length || 0}`);

  if (!credsResponse.credentials || credsResponse.credentials.length === 0) {
    // No credential yet — we need to add a virtual one
    // But this means setup was incomplete
    log('⚠️  No stored WebAuthn credentials found in profile.');
    log('   Adding fresh virtual authenticator...');
    
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
    log('✅ Virtual authenticator added');
  } else {
    // Credential exists! Try auto-login
    log(`✅ Found ${credsResponse.credentials.length} stored credential(s)`);
    
    // Still add virtual authenticator with automaticPresenceSimulation
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
    log('✅ Virtual authenticator enabled (automatic presence simulation ON)');
  }

  // 4. Navigate to the site — the passkey should auto-authenticate
  log('🌐 Navigating to https://runway.edel.finance...');
  
  try {
    await page.goto('https://runway.edel.finance', {
      waitUntil: 'networkidle',
      timeout: 30000,
    });
  } catch (err) {
    log(`⚠️  Navigation warning: ${err.message}`);
  }

  log(`📍 Current URL: ${page.url()}`);

  // 5. Check if we got redirected to /login or /register
  const currentUrl = page.url();
  if (currentUrl.includes('/login') || currentUrl.includes('/register')) {
    log('⚠️  Got redirected to login page. Trying to auth...');
    
    // Try navigating to listing-calls which might trigger auth
    try {
      await page.goto('https://runway.edel.finance/listing-calls', {
        waitUntil: 'networkidle',
        timeout: 30000,
      });
      log(`📍 After retry: ${page.url()}`);
    } catch (err) {
      log(`⚠️  Retry navigation warning: ${err.message}`);
    }
  }

  // 6. Check for old cookies — some cookies survive logout
  // Even if redirected, old cookies might persist and work
  const beforeCookies = await context.cookies();
  log(`🍪 Cookies before: ${beforeCookies.length} total`);
  const beforeEdel = beforeCookies.find(c => c.name === 'edel_session');
  if (beforeEdel) {
    log(`   edel_session: ${beforeEdel.value.substring(0, 30)}... (exp: ${new Date(beforeEdel.expires * 1000).toISOString()})`);
  }

  // 7. Small delay then re-check after page interactions settled
  await new Promise(r => setTimeout(r, 3000));

  // 8. Get fresh cookies
  const cookies = await context.cookies();
  log(`🍪 Cookies after: ${cookies.length} total`);
  
  const edelCookie = cookies.find(c => c.name === 'edel_session');
  
  if (edelCookie && edelCookie.value) {
    log('✅ edel_session cookie OBTAINED!');
    log(`   Value: ${edelCookie.value.substring(0, 40)}...`);
    log(`   Expires: ${new Date(edelCookie.expires * 1000).toISOString()}`);

    // Save to bot's session state
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

    const sessionDir = path.dirname(SESSION_FILE);
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.writeFileSync(SESSION_FILE, JSON.stringify(state, null, 2));
    log('✅ Bot session state.json UPDATED!');
    
    // 9. Quick validation: try accessing assets API
    log('🔍 Validating session via API...');
    try {
      const validateRes = await page.evaluate(async () => {
        const res = await fetch('https://runway.edel.finance/assets', {
          credentials: 'include',
        });
        return res.status;
      });
      if (validateRes === 200) {
        log('✅ Session VALIDATED via API (200)');
      } else {
        log(`⚠️  Session validation returned: ${validateRes}`);
      }
    } catch (err) {
      log(`⚠️  Validation check failed: ${err.message}`);
    }

    await context.close();
    log('=== ✅ AUTO REFRESH COMPLETE ===');
    process.exit(0);
  } else {
    log('❌ No edel_session cookie found after refresh attempt.');
    
    // Check if maybe the session still works with existing profile cookies
    // which may not have edel_session but some other auth mechanism
    const allCookies = await context.cookies();
    log('All cookies:');
    for (const c of allCookies) {
      log(`   ${c.name}: ${c.value.substring(0, 30)}...`);
    }
    
    await context.close();
    log('=== ❌ AUTO REFRESH FAILED ===');
    process.exit(2);
  }
}

main().catch(err => {
  log(`💥 Fatal error: ${err.message}`);
  if (err.stack) log(err.stack.substring(0, 500));
  process.exit(3);
});
