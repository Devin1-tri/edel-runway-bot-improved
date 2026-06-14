import config from './config.js';
import logger from './logger.js';

const TELEGRAM_API = 'https://api.telegram.org/bot';

/**
 * Send a message via Telegram Bot API
 * Uses native fetch (Node.js 18+)
 * @param {string} text - Message text (supports Markdown)
 * @param {object} opts
 * @param {boolean} opts.silent - Send without notification sound
 */
export async function sendTelegram(text, { silent = false } = {}) {
  const { telegramBotToken, telegramChatId } = config;

  if (!telegramBotToken || !telegramChatId) {
    logger.debug('Telegram not configured, skipping notification.');
    return false;
  }

  try {
    const url = `${TELEGRAM_API}${telegramBotToken}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: telegramChatId,
        text,
        parse_mode: 'Markdown',
        disable_notification: silent,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      logger.warn(`Telegram API error (${res.status}): ${body}`);
      return false;
    }

    logger.debug('📨 Telegram notification sent.');
    return true;
  } catch (err) {
    logger.warn(`Telegram send failed: ${err.message}`);
    return false;
  }
}

/**
 * Notify vote success
 */
export async function notifyVoteSuccess(details = {}) {
  const time = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
  const msg = [
    '✅ *VOTE BERHASIL*',
    '',
    `🗳️ Asset: *${details.asset || 'N/A'}*`,
    `🎯 Strategy: \`${details.strategy || 'N/A'}\``,
    `📅 Round: ${details.round || 'N/A'}`,
    `🕐 Waktu: ${time}`,
    details.note ? `📝 Note: ${details.note}` : '',
  ].filter(Boolean).join('\n');

  return sendTelegram(msg);
}

/**
 * Notify vote failed
 */
export async function notifyVoteFailed(details = {}) {
  const time = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
  const msg = [
    '❌ *VOTE GAGAL*',
    '',
    `⚠️ Error: ${details.error || 'Unknown'}`,
    `🎯 Strategy: \`${details.strategy || 'N/A'}\``,
    `🕐 Waktu: ${time}`,
    `🔄 Attempt: ${details.attempt || '?'}/${details.maxAttempts || '?'}`,
    '',
    details.willRetry ? '⏳ Akan retry...' : '🛑 Semua retry gagal.',
  ].join('\n');

  return sendTelegram(msg);
}

/**
 * Notify session expired (Improved to explain Telegram interactive mode)
 */
export async function notifySessionExpired() {
  const msg = [
    '🔑 *SESSION EXPIRED*',
    '',
    'Session login ke Edel Finance sudah expired!',
    'Tapi tenang, kamu tidak perlu SSH atau buka terminal VPS lagi.',
    '',
    '👉 *Cara Update Cookie / Token:*',
    '1. Ambil cookie baru dari Chrome PC (F12 -> Network -> Refresh).',
    '2. Copy cookie `edel_session=...` atau cukup token JWT-nya (`eyJ...`).',
    '3. *Cukup PASTE \u0026 KIRIM langsung ke chat Telegram bot ini!*',
    '',
    'Bot akan otomatis mendeteksi, meng-import, dan melanjutkan voting!',
  ].join('\n');

  return sendTelegram(msg);
}

/**
 * Notify bot started
 */
export async function notifyBotStarted() {
  const time = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
  const totalMin = config.voteIntervalMinutes + config.voteBufferMinutes;
  const msg = [
    '🤖 *BOT STARTED (IMPROVED v3.0)*',
    '',
    `🎯 Strategy: \`${config.voteStrategy}\``,
    `📅 Interval: ${config.voteIntervalMinutes} min + ${config.voteBufferMinutes} min buffer = ${totalMin} min`,
    `🔄 Retry: setiap ${config.retryIntervalMinutes} min (jika belum siap)`,
    `🕐 Started: ${time}`,
    '',
    '💡 *Interactive mode aktif!* Kamu bisa mengirim cookie baru, cek status `/status`, atau force vote `/vote` langsung di chat ini.',
  ].join('\n');

  return sendTelegram(msg);
}

/**
 * Notify next vote scheduled
 */
export async function notifyNextVote(nextTime) {
  const nextStr = nextTime
    ? nextTime.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })
    : 'Unknown';

  const now = new Date();
  const diffMs = nextTime ? nextTime.getTime() - now.getTime() : 0;
  const diffMin = Math.round(diffMs / 60000);

  const msg = [
    '⏰ *NEXT VOTE SCHEDULED*',
    '',
    `🕐 Vote selanjutnya: ${nextStr}`,
    `⏳ Dalam ${diffMin} menit`,
    '📡 Bot tetap berjalan...',
  ].join('\n');

  return sendTelegram(msg, { silent: true });
}

/**
 * Notify already voted
 */
export async function notifyAlreadyVoted(message) {
  const time = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
  const msg = [
    'ℹ️ *SUDAH VOTED*',
    '',
    `📝 Status: ${message || 'Already voted'}`,
    `🕐 Waktu cek: ${time}`,
    '',
    '⏰ Akan coba lagi di jadwal berikutnya.',
  ].join('\n');

  return sendTelegram(msg, { silent: true });
}

export default {
  sendTelegram,
  notifyVoteSuccess,
  notifyVoteFailed,
  notifySessionExpired,
  notifyBotStarted,
  notifyNextVote,
  notifyAlreadyVoted,
};
