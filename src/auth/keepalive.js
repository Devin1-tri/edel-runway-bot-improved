/**
 * Session Keep-Alive module.
 *
 * Periodically pings a lightweight authenticated endpoint to prevent
 * the edel_session cookie from expiring due to server-side idle timeout.
 * If the session has expired, it notifies via Telegram.
 */
import config from '../utils/config.js';
import logger from '../utils/logger.js';
import { sendTelegram } from '../utils/telegram.js';
import { loadSession, getSessionTimeRemaining } from './session.js';

const BASE_URL = config.baseUrl;

let keepaliveTimer = null;
let lastStatus = null; // 'alive' | 'expired' | 'error' | null

/**
 * Perform a lightweight session check by hitting GET /assets.
 * Returns { alive: boolean, status: number }
 */
async function pingSession() {
  try {
    const session = loadSession();
    if (!session || !session.cookies || session.cookies.length === 0) {
      return { alive: false, status: 0, error: 'No session cookies found' };
    }

    const cookie = session.cookies
      .map((c) => `${c.name}=${c.value}`)
      .join('; ');

    const res = await fetch(`${BASE_URL}/assets`, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        cookie,
      },
      redirect: 'manual', // Don't follow redirects to /login
    });

    // 200 = alive, 401/403 = expired, anything else = uncertain
    if (res.status === 200) {
      return { alive: true, status: 200 };
    }

    if (res.status === 401 || res.status === 403) {
      return { alive: false, status: res.status, error: 'Session expired (401/403)' };
    }

    // Check for redirect to login (status 302/301)
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location') || '';
      if (location.includes('/login') || location.includes('/register')) {
        return { alive: false, status: res.status, error: 'Redirected to login' };
      }
    }

    // Other status — uncertain, treat as alive but log
    logger.debug(`Keep-alive ping returned unexpected status: ${res.status}`);
    return { alive: true, status: res.status };
  } catch (err) {
    return { alive: false, status: 0, error: err.message };
  }
}

/**
 * Format remaining time for display
 */
function formatRemaining(remaining) {
  if (!remaining) return 'unknown';
  if (remaining.expired) return 'EXPIRED';
  if (remaining.hours > 0) {
    return `${remaining.hours}j ${remaining.minutes}m`;
  }
  return `${remaining.minutes}m`;
}

/**
 * Run a single keep-alive check cycle
 */
async function keepaliveCheck() {
  const remaining = getSessionTimeRemaining();
  const remainingStr = formatRemaining(remaining);

  logger.debug(`💓 Keep-alive check... (session sisa: ${remainingStr})`);

  const result = await pingSession();

  if (result.alive) {
    if (lastStatus !== 'alive') {
      logger.info(`💓 Session alive (sisa: ${remainingStr})`);
      lastStatus = 'alive';
    }
    return;
  }

  // Session expired!
  logger.warn(`🔑 Keep-alive detected session expired! (${result.error})`);

  if (lastStatus !== 'expired') {
    lastStatus = 'expired';
    const msg = [
      '🔑 *SESSION EXPIRED* (terdeteksi keep-alive)',
      '',
      `⚠️ ${result.error}`,
      '',
      'Bot tidak bisa vote sampai session diperbarui.',
      '',
      '👉 *Cara update:*',
      '1. Login di Chrome → F12 → Network → Refresh',
      '2. Copy cookie `edel_session=eyJ...` atau token JWT-nya',
      '3. *KIRIM langsung ke chat ini!*',
    ].join('\n');

    await sendTelegram(msg);
  }
}

/**
 * Start the keep-alive background timer.
 * Runs an immediate check, then every KEEPALIVE_INTERVAL_MINUTES.
 * @returns {Promise<void>}
 */
export async function startKeepalive() {
  if (!config.keepaliveEnabled) {
    logger.info('💓 Session keep-alive: DISABLED');
    return;
  }

  const intervalMs = config.keepaliveIntervalMinutes * 60 * 1000;
  const remaining = getSessionTimeRemaining();
  const remainingStr = formatRemaining(remaining);

  logger.info(`💓 Session keep-alive: ENABLED (setiap ${config.keepaliveIntervalMinutes} menit, session sisa: ${remainingStr})`);

  // Run first check immediately
  await keepaliveCheck();

  // Schedule recurring checks
  keepaliveTimer = setInterval(keepaliveCheck, intervalMs);
}

/**
 * Stop the keep-alive background timer
 */
export function stopKeepalive() {
  if (keepaliveTimer) {
    clearInterval(keepaliveTimer);
    keepaliveTimer = null;
    logger.info('💓 Session keep-alive stopped.');
  }
}
