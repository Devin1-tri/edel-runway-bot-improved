import config from '../utils/config.js';
import logger, { logSeparator } from '../utils/logger.js';
import { performVote } from '../bot/voter.js';
import {
  notifyVoteSuccess,
  notifyVoteFailed,
  notifySessionExpired,
  notifyBotStarted,
  notifyNextVote,
  notifyAlreadyVoted,
  sendTelegram,
} from '../utils/telegram.js';
import { startTelegramListener, stopTelegramListener } from '../utils/telegram_listener.js';
import { startKeepalive, stopKeepalive } from '../auth/keepalive.js';
import { getSessionTimeRemaining } from '../auth/session.js';

// Track active timer for graceful shutdown
let nextVoteTimer = null;
let lastUrgentWarningTime = 0;

/**
 * Check JWT expiry and send proactive warnings before vote cycle.
 * Returns true if session is expired (caller should skip the vote).
 */
async function checkSessionExpiryWarnings() {
  const remaining = getSessionTimeRemaining();
  if (!remaining) {
    // No JWT exp claim available — can't check, proceed normally
    return false;
  }

  if (remaining.expired) {
    logger.warn('🔑 JWT session sudah EXPIRED!');
    await notifySessionExpired();
    return true;
  }

  // Urgent: < 30 minutes remaining — warn every 5 minutes
  if (remaining.totalMinutes < 30) {
    const now = Date.now();
    const fiveMinutesMs = 5 * 60 * 1000;
    if (now - lastUrgentWarningTime >= fiveMinutesMs) {
      lastUrgentWarningTime = now;
      logger.warn(`🚨 Session tinggal ${remaining.minutes} menit!`);
      await sendTelegram(
        `🚨 *SESSION HAMPIR HABIS!*\n\n` +
        `⏰ Sisa: *${remaining.minutes} menit*\n` +
        `🔑 Segera kirim cookie baru ke chat ini!\n\n` +
        `Bot akan berhenti vote jika session habis.`
      );
    }
    return false; // Still valid, allow vote attempt
  }

  // Warning: < 2 hours remaining
  if (remaining.totalMinutes < 120) {
    logger.warn(`⚠️ Session tinggal ${remaining.hours}j ${remaining.minutes}m`);
    await sendTelegram(
      `⚠️ *Session Expiry Warning*\n\n` +
      `🕐 Session berakhir dalam *${remaining.hours} jam ${remaining.minutes} menit*\n` +
      `📌 Kirim cookie baru sebelum expired agar bot tetap jalan.`
    );
    return false; // Still valid, allow vote attempt
  }

  return false;
}

/**
 * Execute a single vote cycle with retry logic.
 * Returns a status string for scheduling decisions:
 *   'voted'         → successful vote
 *   'already_voted' → already submitted for this round
 *   'waiting'       → no round available / allocation pending
 *   'failed'        → error / session expired
 */
async function voteCycle() {
  logSeparator();
  logger.info(`⏰ Vote cycle dimulai pada ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}`);

  // Proactive JWT expiry check before voting
  const sessionExpired = await checkSessionExpiryWarnings();
  if (sessionExpired) {
    logger.error('🔑 Session expired (JWT check). Skipping vote cycle.');
    return 'failed';
  }

  let lastError = null;

  for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
    logger.info(`🔄 Percobaan ${attempt}/${config.maxRetries}`);

    try {
      const result = await performVote();

      if (result.success) {
        logger.info('🎉 Siklus vote selesai sukses!');

        // Send Telegram notification based on result type
        if (result.details?.note?.includes('Already submitted')) {
          await notifyAlreadyVoted(result.details.note);
          return 'already_voted';
        } else if (result.details?.note) {
          // Informational (waiting, no round, etc.)
          await notifyAlreadyVoted(result.details.note);
          return 'waiting';
        } else {
          await notifyVoteSuccess(result.details);
          return 'voted';
        }
      }

      // Check if session expired
      if (result.details?.sessionExpired) {
        logger.error('🔑 Session expired. Butuh input cookie baru lewat Telegram!');
        await notifySessionExpired();
        return 'failed';
      }

      lastError = result.details?.error;
      logger.warn(`⚠️  Percobaan ${attempt} gagal: ${lastError}`);

      await notifyVoteFailed({
        ...result.details,
        attempt,
        maxAttempts: config.maxRetries,
        willRetry: attempt < config.maxRetries,
      });
    } catch (err) {
      lastError = err.message;
      logger.error(`💥 Percobaan ${attempt} error: ${err.message}`);

      await notifyVoteFailed({
        error: err.message,
        strategy: config.voteStrategy,
        attempt,
        maxAttempts: config.maxRetries,
        willRetry: attempt < config.maxRetries,
      });
    }

    // Wait before retry (exponential backoff)
    if (attempt < config.maxRetries) {
      const delay = config.retryDelay * attempt;
      logger.info(`⏳ Menunggu ${delay / 1000} detik sebelum mencoba lagi...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  logger.error(`❌ Semua ${config.maxRetries} percobaan gagal. Error terakhir: ${lastError}`);
  return 'failed';
}

/**
 * Determine next delay (in ms) based on vote cycle result.
 */
function getNextDelay(result) {
  switch (result) {
    case 'voted':
      return (config.voteIntervalMinutes + config.voteBufferMinutes) * 60 * 1000;
    case 'already_voted':
    case 'waiting':
      return config.retryIntervalMinutes * 60 * 1000;
    case 'failed':
    default:
      return config.retryIntervalMinutes * 60 * 1000;
  }
}

/**
 * Schedule the next vote using dynamic setTimeout.
 *
 * @param {number} delayMs - Delay in milliseconds until next vote
 * @returns {Date} The scheduled next vote time
 */
function scheduleNextVote(delayMs) {
  if (nextVoteTimer) {
    clearTimeout(nextVoteTimer);
    nextVoteTimer = null;
  }

  const nextTime = new Date(Date.now() + delayMs);
  const nextStr = nextTime.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
  const delayMin = Math.round(delayMs / 60000);

  logger.info(`⏰ Vote berikutnya dijadwalkan: ${nextStr} (${delayMin} menit lagi)`);

  nextVoteTimer = setTimeout(async () => {
    try {
      const result = await voteCycle();
      const nextDelay = getNextDelay(result);
      const scheduledTime = scheduleNextVote(nextDelay);
      await notifyNextVote(scheduledTime);
    } catch (err) {
      logger.error(`Error pada siklus vote terjadwal: ${err.message}`);
      const retryDelay = config.retryIntervalMinutes * 60 * 1000;
      const scheduledTime = scheduleNextVote(retryDelay);
      await notifyNextVote(scheduledTime);
    }
  }, delayMs);

  return nextTime;
}

/**
 * Trigger an immediate vote (used by Telegram listener triggers)
 */
async function triggerImmediateVote(reason) {
  logger.info(`⚡ Trigger eksternal diterima: ${reason}`);

  if (nextVoteTimer) {
    clearTimeout(nextVoteTimer);
    nextVoteTimer = null;
  }

  const result = await voteCycle();
  const nextDelay = getNextDelay(result);
  const scheduledTime = scheduleNextVote(nextDelay);
  await notifyNextVote(scheduledTime);
}

/**
 * Start the dynamic vote scheduler.
 */
export async function startScheduler() {
  console.log('');
  console.log('\x1b[36m' +
  ` ██████╗  █████╗ ████████╗ ██████╗ ██╗  ██╗██████╗ ██████╗  ██████╗ ███╗   ██╗        ██╗  ██╗ ██████╗ █████╗ \n` +
  ` ██╔══██╗██╔══██╗╚══██╔══╝██╔═══██╗██║ ██╔╝██╔══██╗██╔══██╗██╔════╝ ████╗  ██║        ██║  ██║██╔════╝██╔══██╗\n` +
  ` ██████╔╝███████║   ██║   ██║   ██║█████╔╝ ██║  ██║██████╔╝██║  ███╗██╔██╗ ██║        ███████║██║     ███████║\n` +
  ` ██╔══██╗██╔══██║   ██║   ██║   ██║██╔═██╗ ██║  ██║██╔══██╗██║   ██║██║╚██╗██║        ██╔══██║██║     ██╔══██║\n` +
  ` ██████╔╝██║  ██║   ██║   ╚██████╔╝██║  ██╗██████╔╝██║  ██║╚██████╔╝██║ ╚████║        ██║  ██║╚██████╗██║  ██║\n` +
  ` ╚═════╝ ╚═╝  ╚═╝   ╚═╝    ╚═════╝ ╚═╝  ╚═╝╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═══╝        ╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝` + '\x1b[0m');
  console.log('');
  console.log('\x1b[90m  ──────────────────────────────────────────────────────────────────────────────────\x1b[0m');
  console.log('\x1b[33m   ⚡ Edel Runway Desk — Auto Vote Bot v3.1 (Session-Aware)\x1b[0m');
  console.log('\x1b[90m   🌐 Pure HTTP Mode — Interactive Telegram Control\x1b[0m');
  console.log('\x1b[90m  ──────────────────────────────────────────────────────────────────────────────────\x1b[0m');
  console.log('');
  logger.info(`📅 Interval : ${config.voteIntervalMinutes} mnt + ${config.voteBufferMinutes} mnt buffer`);
  logger.info(`🔄 Retry    : setiap ${config.retryIntervalMinutes} mnt (jika belum siap)`);
  logger.info(`🎯 Strategy : ${config.voteStrategy}`);
  logger.info(`🔁 Retries  : ${config.maxRetries} per siklus`);
  logger.info(`📨 Telegram : ${config.telegramBotToken ? 'Terbuka (Interactive) ✅' : 'Belum diset ⚠️'}`);
  logger.info(`💓 KeepAlive: ${config.keepaliveEnabled ? `ON (setiap ${config.keepaliveIntervalMinutes} mnt)` : 'OFF'}`);
  logger.info('');

  // Send Telegram notification that bot started
  await notifyBotStarted();

  // Start the Telegram interactive listener
  if (config.telegramBotToken) {
    await startTelegramListener(async (event) => {
      if (event === 'session_refreshed' || event === 'trigger_vote') {
        await triggerImmediateVote(event);
      }
    });
  }

  // Start session keep-alive
  await startKeepalive();

  logger.info('▶️  Menjalankan siklus vote awal...');
  const result = await voteCycle();

  // Schedule next vote dynamically based on result
  const nextDelay = getNextDelay(result);
  const nextTime = scheduleNextVote(nextDelay);
  await notifyNextVote(nextTime);

  logger.info('');
  logger.info('📡 Bot berjalan dengan dynamic scheduling dan kontrol Telegram interaktif.');

  // Handle graceful shutdown
  const shutdown = async () => {
    logger.info('');
    logger.info('🛑 Bot dihentikan...');
    
    // Stop keep-alive
    stopKeepalive();

    // Stop Telegram listener
    stopTelegramListener();

    if (nextVoteTimer) {
      clearTimeout(nextVoteTimer);
      nextVoteTimer = null;
    }
    
    const time = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
    await sendTelegram(`🛑 *BOT STOPPED*\n\n🕐 Waktu: ${time}`);
    logger.info('👋 Sampai jumpa!');
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

/**
 * Run a single vote (no scheduling)
 */
export async function runSingleVote() {
  logSeparator();
  logger.info('🗳️  Menjalankan single vote...');
  await voteCycle();
  logger.info('✅ Siklus single vote selesai.');
}
