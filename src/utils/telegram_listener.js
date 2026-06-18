import config from './config.js';
import logger from './logger.js';
import { saveSessionRaw } from '../auth/session.js';
import { checkSession } from '../api/client.js';
import { getSessionExpiry, getSessionTimeRemaining } from '../auth/session.js';

let pollingActive = false;
let lastUpdateId = 0;

export async function startTelegramListener(onEvent) {
  const { telegramBotToken, telegramChatId } = config;
  if (!telegramBotToken) {
    logger.warn('⚠️ TELEGRAM_BOT_TOKEN tidak diset. Interactive Telegram Control dinonaktifkan.');
    return;
  }

  if (pollingActive) return;
  pollingActive = true;
  logger.info('🤖 Interactive Telegram Bot Listener aktif! Siap menerima command & cookie.');

  // Polling loop (async)
  (async () => {
    while (pollingActive) {
      try {
        const url = `https://api.telegram.org/bot${telegramBotToken}/getUpdates?offset=${lastUpdateId + 1}&timeout=30`;
        const res = await fetch(url);
        if (!res.ok) {
          if (res.status === 401 || res.status === 404) {
            logger.error('❌ TELEGRAM_BOT_TOKEN salah! Polling listener dimatikan.');
            pollingActive = false;
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 5000));
          continue;
        }

        const data = await res.json();
        if (data.ok && data.result.length > 0) {
          for (const update of data.result) {
            lastUpdateId = update.update_id;
            await handleTelegramUpdate(update, onEvent);
          }
        }
      } catch (err) {
        logger.debug(`Telegram polling error: ${err.message}`);
        await new Promise((resolve) => setTimeout(resolve, 10000));
      }
    }
  })();
}

export function stopTelegramListener() {
  pollingActive = false;
}

async function handleTelegramUpdate(update, onEvent) {
  const message = update.message;
  if (!message || !message.text) return;

  const chatId = message.chat.id.toString();
  const text = message.text.trim();

  // Security check
  if (config.telegramChatId && chatId !== config.telegramChatId.toString()) {
    logger.warn(`⚠️ Pesan diblokir dari Telegram Chat ID asing: ${chatId}`);
    return;
  }

  // Help command / Greeting
  if (text.startsWith('/start') || text.toLowerCase() === 'help' || text === '/help') {
    await sendReply(chatId, 
      "👋 *Halo! Aku Edel Runway Bot (Improved v3.0)*\n\n" +
      "Aku bisa menerima update cookie atau JWT token langsung dari sini.\n\n" +
      "👉 *Cara Update Cookie:* Ambil cookie baru dari Chrome PC (F12 -> Network -> Refresh), copy cookie `edel_session=...` atau token JWT-nya (`eyJ...`), lalu *cukup PASTE & KIRIM* langsung ke chat ini!\n\n" +
      "📌 *Perintah yang didukung:* \n" +
      "• `/status` - Cek status session & voting\n" +
      "• `/vote` - Force vote manual sekarang juga\n" +
      "• `/cookie <value>` - Update cookie (bisa langsung kirim teks tanpa command)"
    );
    return;
  }

  // Status check
  if (text === '/status') {
    const valid = await checkSession();
    const expiry = getSessionExpiry();
    const remaining = getSessionTimeRemaining();

    let statusMsg;
    if (valid) {
      statusMsg = `✅ *STATUS SESSION: VALID*\n\nBot berjalan lancar dan siap untuk vote berikutnya!`;
      if (expiry) {
        statusMsg += `\n\n🔐 Berakhir: ${expiry.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}`;
      }
      if (remaining && !remaining.expired) {
        statusMsg += `\n⏰ Sisa: *${remaining.hours} jam ${remaining.minutes} menit*`;
      }
    } else {
      statusMsg = `⚠️ *STATUS SESSION: EXPIRED / BELUM SETUP*\n\nSilakan kirim cookie baru ke chat ini untuk memperbarui!`;
      if (remaining && remaining.expired) {
        statusMsg += `\n\n🔑 JWT sudah expired!`;
      }
    }
    await sendReply(chatId, statusMsg);
    return;
  }

  // Force vote trigger
  if (text === '/vote') {
    await sendReply(chatId, "🗳️ *Memulai manual vote sekarang...*");
    if (onEvent) {
      await onEvent('trigger_vote');
    }
    return;
  }

  // Detect and process cookie / token
  let tokenCandidate = text;
  if (text.startsWith('/cookie ')) {
    tokenCandidate = text.substring(8).trim();
  }

  const isJwt = tokenCandidate.startsWith('eyJ');
  const isCookieString = tokenCandidate.includes('edel_session=');

  if (isJwt || isCookieString) {
    await sendReply(chatId, "🔄 *Sedang meng-import dan memverifikasi token baru...*");
    try {
      let cookies = [];
      if (isJwt) {
        cookies = [
          {
            name: 'edel_session',
            value: tokenCandidate,
            domain: 'runway.edel.finance',
            path: '/',
            expires: Date.now() / 1000 + 86400 * 30,
            httpOnly: false,
            secure: true,
            sameSite: 'Lax',
          }
        ];
      } else {
        // Full cookie string
        const cleaned = tokenCandidate.replace(/^Cookie:\s*/i, '').trim();
        const pairs = cleaned.split(/;\s*/);
        for (const pair of pairs) {
          const eqIdx = pair.indexOf('=');
          if (eqIdx === -1) continue;
          const name = pair.substring(0, eqIdx).trim();
          const value = pair.substring(eqIdx + 1).trim();
          if (name) {
            cookies.push({
              name,
              value,
              domain: 'runway.edel.finance',
              path: '/',
              expires: Date.now() / 1000 + 86400 * 30,
              httpOnly: false,
              secure: true,
              sameSite: 'Lax',
            });
          }
        }
      }

      if (cookies.length === 0) {
        await sendReply(chatId, "❌ *Gagal meng-parse cookie.* Pastikan formatnya benar!");
        return;
      }

      const state = {
        cookies,
        origins: [{ origin: 'https://runway.edel.finance', localStorage: [] }]
      };

      saveSessionRaw(state);

      // Verify
      const isValid = await checkSession();
      if (isValid) {
        await sendReply(chatId, "✅ *COOKIE BERHASIL DIPASANG!*\n\nVerifikasi sukses. Bot melanjutkan voting otomatis.");
        if (onEvent) {
          await onEvent('session_refreshed');
        }
      } else {
        await sendReply(chatId, "⚠️ *Cookie disimpan, tapi verifikasi ke API gagal.* Mungkin token yang kamu masukkan salah atau sudah expired!");
      }
    } catch (err) {
      await sendReply(chatId, `❌ *Gagal memproses cookie:* ${err.message}`);
    }
  } else if (text.startsWith('/')) {
    await sendReply(chatId, "❓ *Perintah tidak dikenal.* Kirim `/help` untuk daftar perintah.");
  }
}

async function sendReply(chatId, text) {
  const { telegramBotToken } = config;
  try {
    await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'Markdown'
      })
    });
  } catch (err) {
    logger.error(`Gagal mengirim respon ke Telegram: ${err.message}`);
  }
}
